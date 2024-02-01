import * as db from "../db.js"
import { Knex } from "knex"
import {
    CategoryWithEntries,
    DbEnrichedPost,
    DbRawPost,
    FilterFnPostRestApi,
    FullPost,
    JsonError,
    PostRestApi,
    WP_PostType,
    parsePostRow,
} from "@ourworldindata/utils"
import { getFullPost } from "../wpdb.js"
import { SiteNavigationStatic } from "../../site/SiteNavigation.js"
import { BLOG_SLUG } from "../../settings/serverSettings.js"

export const postsTable = "posts"

export const select = <K extends keyof DbRawPost>(
    ...args: K[]
): {
    from: (query: Knex.QueryBuilder) => Promise<Pick<DbRawPost, K>[]>
} => ({
    from: (query) => query.select(...args) as any,
})

export const getTagsByPostId = async (): Promise<
    Map<number, { id: number; name: string }[]>
> => {
    const postTags = await db.queryMysql(`
            SELECT pt.post_id AS postId, pt.tag_id AS tagId, t.name as tagName FROM post_tags pt
            JOIN posts p ON p.id=pt.post_id
            JOIN tags t ON t.id=pt.tag_id
        `)

    const tagsByPostId: Map<number, { id: number; name: string }[]> = new Map()

    for (const pt of postTags) {
        const tags = tagsByPostId.get(pt.postId) || []
        tags.push({ id: pt.tagId, name: pt.tagName })
        tagsByPostId.set(pt.postId, tags)
    }

    return tagsByPostId
}

export const setTags = async (
    postId: number,
    tagIds: number[]
): Promise<void> =>
    await db.transaction(async (t) => {
        const tagRows = tagIds.map((tagId) => [tagId, postId])
        await t.execute(`DELETE FROM post_tags WHERE post_id=?`, [postId])
        if (tagRows.length)
            await t.execute(
                `INSERT INTO post_tags (tag_id, post_id) VALUES ?`,
                [tagRows]
            )
    })

export const setTagsForPost = async (
    postId: number,
    tagIds: number[]
): Promise<void> =>
    await db.transaction(async (t) => {
        const tagRows = tagIds.map((tagId) => [tagId, postId])
        await t.execute(`DELETE FROM post_tags WHERE post_id=?`, [postId])
        if (tagRows.length)
            await t.execute(
                `INSERT INTO post_tags (tag_id, post_id) VALUES ?`,
                [tagRows]
            )
    })

export const getPostRawBySlug = async (
    slug: string
): Promise<DbRawPost | undefined> =>
    (await db.knexTable(postsTable).where({ slug }))[0]

export const getPostRawById = async (
    id: number
): Promise<DbRawPost | undefined> =>
    (await db.knexTable(postsTable).where({ id }))[0]

export const getPostEnrichedBySlug = async (
    slug: string
): Promise<DbEnrichedPost | undefined> => {
    const post = await getPostRawBySlug(slug)
    if (!post) return undefined
    return parsePostRow(post)
}

export const getPostEnrichedById = async (
    id: number
): Promise<DbEnrichedPost | undefined> => {
    const post = await getPostRawById(id)
    if (!post) return undefined
    return parsePostRow(post)
}

export const getFullPostBySlugFromSnapshot = async (
    slug: string
): Promise<FullPost> => {
    const postEnriched = await getPostEnrichedBySlug(slug)
    if (!postEnriched?.wpApiSnapshot)
        throw new JsonError(`No page snapshot found by slug ${slug}`, 404)

    return getFullPost(postEnriched.wpApiSnapshot)
}

export const getFullPostByIdFromSnapshot = async (
    id: number
): Promise<FullPost> => {
    const postEnriched = await getPostEnrichedById(id)
    if (!postEnriched?.wpApiSnapshot)
        throw new JsonError(`No page snapshot found by id ${id}`, 404)

    return getFullPost(postEnriched.wpApiSnapshot)
}

export const isPostSlugCitable = async (slug: string): Promise<boolean> => {
    const entries = SiteNavigationStatic.categories
    return entries.some((category) => {
        return (
            category.entries.some((entry) => entry.slug === slug) ||
            (category.subcategories ?? []).some(
                (subcategory: CategoryWithEntries) => {
                    return subcategory.entries.some(
                        (subCategoryEntry) => subCategoryEntry.slug === slug
                    )
                }
            )
        )
    })
}

export const getPostsFromSnapshots = async (
    postTypes: string[] = [WP_PostType.Post, WP_PostType.Page],
    filterFunc?: FilterFnPostRestApi
): Promise<PostRestApi[]> => {
    const rawPosts: DbRawPost[] = (
        await db.knexInstance().raw(
            `
                SELECT * FROM ${postsTable}
                WHERE status = "publish"
                AND type IN (?)
                ORDER BY JSON_UNQUOTE(JSON_EXTRACT(wpApiSnapshot, '$.date')) DESC;
            `,
            [postTypes].join(",")
        )
    )[0]

    const posts = rawPosts
        .map(parsePostRow)
        .map((p) => p.wpApiSnapshot)
        .filter((p) => p !== null) as PostRestApi[]

    // Published pages excluded from public views
    const excludedSlugs = [BLOG_SLUG]

    const filterConditions: Array<FilterFnPostRestApi> = [
        (post): boolean => !excludedSlugs.includes(post.slug),
        (post): boolean => !post.slug.endsWith("-country-profile"),
    ]
    if (filterFunc) filterConditions.push(filterFunc)

    return posts.filter((post) => filterConditions.every((c) => c(post)))
}
