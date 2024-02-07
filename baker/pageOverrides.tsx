import { PageOverrides } from "../site/LongFormPage.js"
import { BAKED_BASE_URL } from "../settings/serverSettings.js"
import { urlToSlug, FullPost, JsonError } from "@ourworldindata/utils"
import { FormattingOptions } from "@ourworldindata/types"
import { getTopSubnavigationParentItem } from "../site/SiteSubnavigation.js"
import { logErrorAndMaybeSendToBugsnag } from "../serverUtils/errorLog.js"
import {
    getFullPostBySlugFromSnapshot,
    isPostSlugCitable,
} from "../db/model/Post.js"

export const getPostBySlugLogToSlackNoThrow = async (slug: string) => {
    let post
    try {
        post = await getFullPostBySlugFromSnapshot(slug)
    } catch (err) {
        logErrorAndMaybeSendToBugsnag(err)
    } finally {
        return post
    }
}

export const getLandingOnlyIfParent = async (
    post: FullPost,
    formattingOptions: FormattingOptions
) => {
    if (!formattingOptions.subnavId) return

    const landingItemHref = getTopSubnavigationParentItem(
        formattingOptions.subnavId
    )?.href
    if (!landingItemHref) return

    const landingSlug = urlToSlug(landingItemHref)
    if (landingSlug === post.slug) return

    // Using no-throw version to prevent throwing and stopping baking mid-way.
    // It is more desirable to temporarily deploy with citation overrides
    // absent, while fixing the issue.
    const landing = await getPostBySlugLogToSlackNoThrow(landingSlug)
    if (!landing) {
        // todo: the concept of "citation overrides" does not belong to that
        // generic function. Logging this message should be the responsibility
        // of the caller function.
        logErrorAndMaybeSendToBugsnag(
            new JsonError(
                // This error often shows up intermittently as a false-positive (DB unavailable when calling getPostBySlug()?)
                // If it happens systematically, please check
                // the href of the "subnavs[${formattingOptions.subnavId}]"
                // landing page (the first item in the array): it might be
                // out-of-date and redirected.
                `Citation overrides not applied for ${post.slug}. This might be an intermittent issue.`
            )
        )
    }

    return landing
}

export const getPageOverrides = async (
    post: FullPost,
    formattingOptions: FormattingOptions
): Promise<PageOverrides | undefined> => {
    const landing = await getLandingOnlyIfParent(post, formattingOptions)
    if (!landing) return

    const isParentLandingCitable = await isPostSlugCitable(landing.slug)
    if (!isParentLandingCitable) return

    return {
        citationTitle: landing.title,
        citationSlug: landing.slug,
        citationCanonicalUrl: `${BAKED_BASE_URL}/${landing.slug}`,
        citationAuthors: landing.authors,
        citationPublicationDate: landing.date,
    }
}

export const isPageOverridesCitable = (pageOverrides?: PageOverrides) => {
    if (!pageOverrides) return false

    return (
        !!pageOverrides.citationTitle &&
        !!pageOverrides.citationSlug &&
        !!pageOverrides.citationCanonicalUrl &&
        !!pageOverrides.citationAuthors &&
        !!pageOverrides.citationPublicationDate
    )
}
