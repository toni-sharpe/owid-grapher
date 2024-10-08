import { Grapher } from "@ourworldindata/grapher"
import {
    Bounds,
    excludeUndefined,
    GrapherInterface,
    R2GrapherConfigDirectory,
} from "@ourworldindata/utils"
import { svg2png, initialize as initializeSvg2Png } from "svg2png-wasm"
import { TimeLogger } from "./timeLogger"
import { png, StatusError } from "itty-router"

import svg2png_wasm from "../../node_modules/svg2png-wasm/svg2png_wasm_bg.wasm"

// these are regular .ttf files, but cloudflare needs the .bin extension to serve them correctly
import LatoRegular from "../_common/fonts/LatoLatin-Regular.ttf.bin"
import LatoMedium from "../_common/fonts/LatoLatin-Medium.ttf.bin"
import LatoBold from "../_common/fonts/LatoLatin-Bold.ttf.bin"
import PlayfairSemiBold from "../_common/fonts/PlayfairDisplayLatin-SemiBold.ttf.bin"
import { Env } from "./env.js"

declare global {
    // eslint-disable-next-line no-var
    var window: any
}

export type Etag = string

const grapherBaseUrl = "https://ourworldindata.org/grapher"

// Lots of defaults; these are mostly the same as they are in owid-grapher.
// Note, however, that these are not being used for Twitter or Facebook images, these use custom sizes defined below.
const DEFAULT_WIDTH = 850
const DEFAULT_HEIGHT = 600
const DEFAULT_ASPECT_RATIO = DEFAULT_WIDTH / DEFAULT_HEIGHT
const DEFAULT_NUM_PIXELS = DEFAULT_WIDTH * DEFAULT_HEIGHT
const MIN_ASPECT_RATIO = 0.5
const MAX_ASPECT_RATIO = 2
const MAX_NUM_PNG_PIXELS = 4250 * 3000 // 12.75 megapixels, or 5x the initial resolution, is the maximum png size we generate

// We collect the possible extensions here so we can easily take them into account
// when handling redirects
export const extensions = {
    configJson: ".config.json",
    png: ".png",
    svg: ".svg",
}

interface ImageOptions {
    pngWidth: number
    pngHeight: number
    svgWidth: number
    svgHeight: number
    details: boolean
    fontSize: number
}

const TWITTER_OPTIONS: ImageOptions = {
    // Twitter cards are 1.91:1 in aspect ratio, and 800x418 is the recommended size
    pngWidth: 800,
    pngHeight: 418,
    svgWidth: 800,
    svgHeight: 418,
    details: false,
    fontSize: 21,
}

const OPEN_GRAPH_OPTIONS: ImageOptions = {
    // Open Graph is used by "everything but Twitter": Facebook, LinkedIn, WhatsApp, Signal, etc.
    pngWidth: 1200,
    pngHeight: 628,
    svgWidth: 800,
    svgHeight: 418,
    details: false,
    fontSize: 21,
}

let initialized = false

const extractOptions = (params: URLSearchParams): ImageOptions => {
    const options: Partial<ImageOptions> = {}

    // We have two special images types specified via the `imType` query param:
    if (params.get("imType") === "twitter") return TWITTER_OPTIONS
    else if (params.get("imType") === "og") return OPEN_GRAPH_OPTIONS

    // Otherwise, query params can specify the size to be rendered at; and in addition we're doing a
    // bunch of normalization to make sure the image is rendered at a reasonable size and aspect ratio.

    if (params.has("imWidth"))
        options.pngWidth = parseInt(params.get("imWidth")!)
    if (params.has("imHeight"))
        options.pngHeight = parseInt(params.get("imHeight")!)
    options.details = params.get("imDetails") === "1"
    if (params.has("imFontSize"))
        options.fontSize = parseInt(params.get("imFontSize")!)

    // If only one dimension is specified, use the default aspect ratio
    if (options.pngWidth && !options.pngHeight)
        options.pngHeight = options.pngWidth / DEFAULT_ASPECT_RATIO
    else if (options.pngHeight && !options.pngWidth)
        options.pngWidth = options.pngHeight * DEFAULT_ASPECT_RATIO

    if (options.pngWidth && options.pngHeight) {
        // Clamp to min/max aspect ratio
        const aspectRatio = options.pngWidth / options.pngHeight
        if (aspectRatio < MIN_ASPECT_RATIO) {
            options.pngWidth = options.pngHeight * MIN_ASPECT_RATIO
        } else if (aspectRatio > MAX_ASPECT_RATIO) {
            options.pngHeight = options.pngWidth / MAX_ASPECT_RATIO
        }

        // Cap image size to MAX_NUM_PNG_PIXELS
        if (options.pngWidth * options.pngHeight > MAX_NUM_PNG_PIXELS) {
            const ratio = Math.sqrt(
                MAX_NUM_PNG_PIXELS / (options.pngWidth * options.pngHeight)
            )
            options.pngWidth *= ratio
            options.pngHeight *= ratio
        }

        // Grapher is best rendered at a resolution close to 850x600, because otherwise some elements are
        // comically small (e.g. our logo, the map legend, etc). So we create the svg at a lower resolution,
        // but if we are returning a png we render it at the requested resolution.
        const factor = Math.sqrt(
            DEFAULT_NUM_PIXELS / (options.pngWidth * options.pngHeight)
        )
        options.svgWidth = Math.round(options.pngWidth * factor)
        options.svgHeight = Math.round(options.pngHeight * factor)

        options.pngWidth = Math.round(options.pngWidth)
        options.pngHeight = Math.round(options.pngHeight)
    } else {
        options.pngWidth = options.svgWidth = DEFAULT_WIDTH
        options.pngHeight = options.svgHeight = DEFAULT_HEIGHT
    }

    if (
        !options.fontSize &&
        options.svgHeight &&
        options.svgHeight !== DEFAULT_HEIGHT
    ) {
        options.fontSize = Math.max(10, options.svgHeight / 25)
    }

    return options as ImageOptions
}

const WORKER_CACHE_TIME_IN_SECONDS = 60

async function fetchFromR2(
    url: URL,
    etag: string | undefined,
    fallbackUrl?: URL
) {
    const headers = new Headers()
    if (etag) headers.set("If-None-Match", etag)
    const init = {
        cf: {
            cacheEverything: true,
            cacheTtl: WORKER_CACHE_TIME_IN_SECONDS,
        },
        headers,
    }
    const primaryResponse = await fetch(url.toString(), init)
    // The fallback URL here is used so that on staging or dev we can fallback
    // to the production bucket if the file is not found in the branch bucket
    if (primaryResponse.status === 404 && fallbackUrl) {
        return fetch(fallbackUrl.toString(), init)
    }
    return primaryResponse
}

interface FetchGrapherConfigResult {
    grapherConfig: GrapherInterface | null
    status: number
    etag: string | undefined
}

export interface GrapherSlug {
    type: "slug"
    id: string
}

export interface GrapherUuid {
    type: "uuid"
    id: string
}

export type GrapherIdentifier = GrapherSlug | GrapherUuid

export async function fetchUnparsedGrapherConfig(
    identifier: GrapherIdentifier,
    env: Env,
    etag?: string
) {
    // The top level directory is either the bucket path (should be set in dev environments and production)
    // or the branch name on preview staging environments
    console.log("branch", env.CF_PAGES_BRANCH)
    const topLevelDirectory = env.GRAPHER_CONFIG_R2_BUCKET_PATH
        ? [env.GRAPHER_CONFIG_R2_BUCKET_PATH]
        : ["by-branch", env.CF_PAGES_BRANCH]

    const directory =
        identifier.type === "slug"
            ? R2GrapherConfigDirectory.publishedGrapherBySlug
            : R2GrapherConfigDirectory.byUUID

    const key = excludeUndefined([
        ...topLevelDirectory,
        directory,
        `${identifier.id}.json`,
    ]).join("/")

    console.log("fetching grapher config from this key", key)

    const requestUrl = new URL(key, env.GRAPHER_CONFIG_R2_BUCKET_URL)

    let fallbackUrl

    if (
        env.GRAPHER_CONFIG_R2_BUCKET_FALLBACK_URL &&
        env.GRAPHER_CONFIG_R2_BUCKET_FALLBACK_PATH
    ) {
        const topLevelDirectory = env.GRAPHER_CONFIG_R2_BUCKET_FALLBACK_PATH
        const fallbackKey = excludeUndefined([
            topLevelDirectory,
            directory,
            `${identifier.id}.json`,
        ]).join("/")
        fallbackUrl = new URL(
            fallbackKey,
            env.GRAPHER_CONFIG_R2_BUCKET_FALLBACK_URL
        )
    }

    // Fetch grapher config
    return fetchFromR2(requestUrl, etag, fallbackUrl)
}

export async function fetchGrapherConfig(
    identifier: GrapherIdentifier,
    env: Env,
    etag?: string
): Promise<FetchGrapherConfigResult> {
    const fetchResponse = await fetchUnparsedGrapherConfig(
        identifier,
        env,
        etag
    )

    if (fetchResponse.status === 404) {
        // we throw 404 errors instead of returning a 404 response so that the router
        // catch handler can do a lookup in the redirects file and maybe send
        // a 302 redirect response
        throw new StatusError(404)
    }

    if (fetchResponse.status !== 200) {
        console.log(
            "Status code is not 200, returning empty response with status code",
            fetchResponse.status
        )
        return {
            grapherConfig: null,
            status: fetchResponse.status,
            etag: fetchResponse.headers.get("etag"),
        }
    }

    const grapherConfig: GrapherInterface = await fetchResponse.json()
    console.log("grapher title", grapherConfig.title)
    return {
        grapherConfig,
        status: 200,
        etag: fetchResponse.headers.get("etag"),
    }
}

async function fetchAndRenderGrapherToSvg(
    id: GrapherIdentifier,
    options: ImageOptions,
    searchParams: URLSearchParams,
    env: Env
): Promise<string> {
    const grapherLogger = new TimeLogger("grapher")

    const grapherConfigResponse = await fetchGrapherConfig(id, env)

    if (grapherConfigResponse.status === 404) {
        // we throw 404 errors instad of returning a 404 response so that the router
        // catch handler can do a lookup in the redirects file and maybe send
        // a 302 redirect response
        throw new StatusError(grapherConfigResponse.status)
    }

    const bounds = new Bounds(0, 0, options.svgWidth, options.svgHeight)
    const grapher = new Grapher({
        ...grapherConfigResponse.grapherConfig,
        bakedGrapherURL: grapherBaseUrl,
        queryStr: "?" + searchParams.toString(),
        bounds,
        staticBounds: bounds,
        baseFontSize: options.fontSize,
    })
    grapher.shouldIncludeDetailsInStaticExport = options.details

    grapherLogger.log("grapherInit")
    const promises = []
    promises.push(grapher.downloadLegacyDataFromOwidVariableIds())

    if (options.details && grapher.detailsOrderedByReference.length) {
        promises.push(
            await fetch("https://ourworldindata.org/dods.json")
                .then((r) => r.json())
                .then((details) => {
                    globalThis.window = { details }
                })
        )
    }

    await Promise.all(promises) // Run these (potentially) two fetches in parallel
    grapherLogger.log("fetchDataAndDods")

    const svg = grapher.generateStaticSvg()
    grapherLogger.log("generateStaticSvg")
    return svg
}

export const fetchAndRenderGrapher = async (
    id: GrapherIdentifier,
    searchParams: URLSearchParams,
    outType: "png" | "svg",
    env: Env
) => {
    const options = extractOptions(searchParams)

    console.log("Rendering", id.id, outType, options)
    const svg = await fetchAndRenderGrapherToSvg(id, options, searchParams, env)
    console.log("fetched svg")

    switch (outType) {
        case "png":
            return png(await renderSvgToPng(svg, options))
        case "svg":
            return new Response(svg, {
                headers: {
                    "Content-Type": "image/svg+xml",
                },
            })
    }
}

async function renderSvgToPng(svg: string, options: ImageOptions) {
    if (!initialized) {
        await initializeSvg2Png(svg2png_wasm)
        initialized = true
    }

    const pngLogger = new TimeLogger("png")
    const pngData = await svg2png(svg, {
        width: options.pngWidth,

        // if we include details, pngHeight is only the height of the chart, but we also have an "appendix" at the bottom that we want to include
        height: options.details ? undefined : options.pngHeight,
        backgroundColor: "#fff",
        fonts: [LatoRegular, LatoMedium, LatoBold, PlayfairSemiBold].map(
            (f) => new Uint8Array(f)
        ),
    })
    pngLogger.log("svg2png")
    return pngData
}

export async function getOptionalRedirectForSlug(
    slug: string,
    baseUrl: URL,
    env: Env
): Promise<string | undefined> {
    const redirects: Record<string, string> = await env.ASSETS.fetch(
        new URL("/grapher/_grapherRedirects.json", baseUrl),
        { cf: { cacheTtl: 2 * 60 } }
    )
        .then((r): Promise<Record<string, string>> => r.json())
        .catch((e) => {
            console.error("Error fetching redirects", e)
            return {}
        })
    return redirects[slug]
}

export function createRedirectResponse(
    redirSlug: string,
    currentUrl: URL
): Response {
    return new Response(null, {
        status: 302,
        headers: { Location: `/grapher/${redirSlug}${currentUrl.search}` },
    })
}

export async function getRedirectForUrl(env: Env, url: URL): Promise<Response> {
    const fullslug = url.pathname.split("/").pop()

    const allExtensions = Object.values(extensions)
        .map((ext) => ext.replace(".", "\\.")) // for the regex make sure we match only a single dot, not any character
        .join("|")
    const regexForKnownExtensions = new RegExp(
        `^(?<slug>.*?)(?<extension>${allExtensions})?$`
    )

    const matchResult = fullslug.match(regexForKnownExtensions)
    const slug = matchResult?.groups?.slug ?? fullslug
    const extension = matchResult?.groups?.extension ?? ""

    if (slug.toLowerCase() !== slug)
        return createRedirectResponse(`${slug.toLowerCase()}${extension}`, url)

    console.log("Looking up slug and extension", {
        slug,
        extension,
    })

    const redirectSlug = await getOptionalRedirectForSlug(slug, url, {
        ...env,
        url,
    })
    console.log("Redirect slug", redirectSlug)
    if (redirectSlug && redirectSlug !== slug) {
        return createRedirectResponse(`${redirectSlug}${extension}`, url)
    }
}

export async function handlePageNotFound(
    env: Env,
    response: Response
): Promise<Response> {
    const url = new URL(response.url)
    console.log("Handling 404 for", url.pathname)
    const redirect = await getRedirectForUrl(env, url)
    return redirect || response
}
