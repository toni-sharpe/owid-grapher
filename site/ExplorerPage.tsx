import {
    GRAPHER_PAGE_BODY_CLASS,
    GRAPHER_SETTINGS_DRAWER_ID,
    LoadingIndicator,
} from "@ourworldindata/grapher"
import {
    serializeJSONForHTML,
    SiteFooterContext,
    GrapherInterface,
} from "@ourworldindata/utils"
import React from "react"
import {
    EMBEDDED_EXPLORER_DELIMITER,
    EMBEDDED_EXPLORER_GRAPHER_CONFIGS,
    EMBEDDED_EXPLORER_PARTIAL_GRAPHER_CONFIGS,
    ExplorerContainerId,
    EXPLORERS_ROUTE_FOLDER,
} from "../explorer/ExplorerConstants.js"
import { ExplorerProgram } from "../explorer/ExplorerProgram.js"
import { ExplorerPageUrlMigrationSpec } from "../explorer/urlMigrations/ExplorerPageUrlMigrationSpec.js"
import { Head } from "../site/Head.js"
import { IFrameDetector } from "../site/IframeDetector.js"
import { SiteFooter } from "../site/SiteFooter.js"
import { SiteHeader } from "../site/SiteHeader.js"
import { SiteSubnavigation } from "../site/SiteSubnavigation.js"

interface ExplorerPageSettings {
    program: ExplorerProgram
    wpContent?: string
    grapherConfigs: GrapherInterface[]
    partialGrapherConfigs: GrapherInterface[]
    baseUrl: string
    urlMigrationSpec?: ExplorerPageUrlMigrationSpec
}

const ExplorerContent = ({ content }: { content: string }) => {
    return (
        <div className="explorerContentContainer">
            <div className="sidebar"></div>
            <div className="article-content">
                <section>
                    <div className="wp-block-columns is-style-sticky-right">
                        <div
                            className="wp-block-column"
                            dangerouslySetInnerHTML={{
                                __html: content,
                            }}
                        ></div>
                        <div className="wp-block-column"></div>
                    </div>
                </section>
            </div>
        </div>
    )
}

export const ExplorerPage = (props: ExplorerPageSettings) => {
    const {
        wpContent,
        program,
        grapherConfigs,
        partialGrapherConfigs,
        baseUrl,
        urlMigrationSpec,
    } = props
    const {
        subNavId,
        subNavCurrentId,
        explorerTitle,
        explorerSubtitle,
        slug,
        thumbnail,
        hideAlertBanner,
    } = program
    const subNav = subNavId ? (
        <SiteSubnavigation
            subnavId={subNavId}
            subnavCurrentId={subNavCurrentId}
        />
    ) : undefined

    const inlineJs = `const explorerProgram = ${serializeJSONForHTML(
        program.toJson(),
        EMBEDDED_EXPLORER_DELIMITER
    )};
const grapherConfigs = ${serializeJSONForHTML(
        grapherConfigs,
        EMBEDDED_EXPLORER_GRAPHER_CONFIGS
    )};
const partialGrapherConfigs = ${serializeJSONForHTML(
        partialGrapherConfigs,
        EMBEDDED_EXPLORER_PARTIAL_GRAPHER_CONFIGS
    )};
const urlMigrationSpec = ${
        urlMigrationSpec ? JSON.stringify(urlMigrationSpec) : "undefined"
    };
window.Explorer.renderSingleExplorerOnExplorerPage(explorerProgram, grapherConfigs, partialGrapherConfigs, urlMigrationSpec);`

    return (
        <html>
            <Head
                canonicalUrl={`${baseUrl}/${EXPLORERS_ROUTE_FOLDER}/${slug}`}
                hideCanonicalUrl // explorers set their canonical url dynamically
                pageTitle={`${explorerTitle} Data Explorer`}
                pageDesc={explorerSubtitle}
                imageUrl={thumbnail}
                baseUrl={baseUrl}
            >
                <IFrameDetector />
            </Head>
            <body className={GRAPHER_PAGE_BODY_CLASS}>
                <SiteHeader
                    baseUrl={baseUrl}
                    hideAlertBanner={hideAlertBanner || false}
                />
                {subNav}
                <nav id={GRAPHER_SETTINGS_DRAWER_ID}></nav>
                <main id={ExplorerContainerId}>
                    <LoadingIndicator />
                </main>
                {wpContent && <ExplorerContent content={wpContent} />}
                <SiteFooter
                    baseUrl={baseUrl}
                    context={SiteFooterContext.explorerPage}
                />
                <script
                    type="module"
                    dangerouslySetInnerHTML={{ __html: inlineJs }}
                />
            </body>
        </html>
    )
}
