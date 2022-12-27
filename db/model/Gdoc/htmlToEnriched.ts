import {
    Span,
    EnrichedBlockText,
    SpanLink,
    SpanBold,
    SpanItalic,
    SpanFallback,
    SpanQuote,
    SpanSuperscript,
    SpanSubscript,
    SpanUnderline,
    SpanRef,
    EnrichedBlockSimpleText,
    SpanSimpleText,
    OwidEnrichedArticleBlock,
    EnrichedBlockImage,
    EnrichedBlockPullQuote,
    EnrichedBlockHeading,
    EnrichedBlockChart,
    EnrichedBlockHtml,
    EnrichedBlockList,
    EnrichedBlockStickyRightContainer,
    EnrichedBlockNumberedList,
} from "@ourworldindata/utils"
import { match, P } from "ts-pattern"
import { compact, flatten, partition } from "lodash"
import * as cheerio from "cheerio"

//#region Spans
function spanFallback(element: CheerioElement): SpanFallback {
    return {
        spanType: "span-fallback",
        children: compact(element.children?.map(cheerioToSpan)) ?? [],
    }
}

export function htmlToEnrichedTextBlock(html: string): EnrichedBlockText {
    return {
        type: "text",
        value: htmlToSpans(html),
        parseErrors: [],
    }
}

export function consolidateSpans(
    blocks: OwidEnrichedArticleBlock[]
): OwidEnrichedArticleBlock[] {
    const newBlocks: OwidEnrichedArticleBlock[] = []
    let currentBlock: EnrichedBlockText | undefined = undefined
    for (const block of blocks) {
        if (block.type === "text")
            if (currentBlock === undefined) currentBlock = block
            else
                currentBlock = {
                    type: "text",
                    value: [...currentBlock.value, ...block.value],
                    parseErrors: [],
                }
        else {
            if (currentBlock !== undefined) {
                newBlocks.push(currentBlock)
                currentBlock = undefined
                newBlocks.push(block)
            }
        }
    }
    return newBlocks
}

export function htmlToSimpleTextBlock(html: string): EnrichedBlockSimpleText {
    const spans = htmlToSpans(html)
    const [simpleTextSpans, otherSpans] = partition(
        spans,
        (s) => s.spanType === "span-simple-text"
    )
    const simpleText: SpanSimpleText = {
        spanType: "span-simple-text",
        text: simpleTextSpans.map((s) => (s as SpanSimpleText).text).join(" "),
    }
    const parseErrors =
        otherSpans.length > 0
            ? [
                  {
                      message:
                          "Formatted text fragments found in simple text block",
                  },
              ]
            : []
    return {
        type: "simple-text",
        value: simpleText,
        parseErrors: parseErrors,
    }
}

export function htmlToSpans(html: string): Span[] {
    const $ = cheerio.load(html)
    const elements = $("body").contents().toArray()
    return compact(elements.map(cheerioToSpan)) ?? []
}

export function cheerioToSpan(element: CheerioElement): Span | undefined {
    if (element.type === "text")
        // The regex replace takes care of the ArchieML escaping of :
        return {
            spanType: "span-simple-text",
            text: element.data?.replace(/\\:/g, ":") ?? "",
        }
    else if (element.type === "tag") {
        return match(element.tagName)
            .with("a", (): SpanLink | SpanRef => {
                const url = element.attribs.href
                const className = element.attribs.class
                const children =
                    compact(element.children?.map(cheerioToSpan)) ?? []
                if (className === "ref") {
                    return { spanType: "span-ref", children, url }
                }
                return { spanType: "span-link", children, url }
            })
            .with("b", (): SpanBold => {
                const children =
                    compact(element.children?.map(cheerioToSpan)) ?? []
                return { spanType: "span-bold", children }
            })
            .with("i", (): SpanItalic => {
                const children =
                    compact(element.children?.map(cheerioToSpan)) ?? []
                return { spanType: "span-italic", children }
            })
            .with("br", (): Span => ({ spanType: "span-newline" }))
            .with("cite", () => spanFallback(element))
            .with("code", () => spanFallback(element)) // TODO: should get a style
            .with(
                "em",
                (): SpanItalic => ({
                    spanType: "span-italic",
                    children:
                        compact(element.children?.map(cheerioToSpan)) ?? [],
                })
            )
            .with(
                "q",
                (): SpanQuote => ({
                    spanType: "span-quote",
                    children:
                        compact(element.children?.map(cheerioToSpan)) ?? [],
                })
            )
            .with("small", () => spanFallback(element))
            .with("span", () => spanFallback(element))
            .with("strong", (): SpanBold => {
                const children =
                    compact(element.children?.map(cheerioToSpan)) ?? []
                return { spanType: "span-bold", children }
            })
            .with("sup", (): SpanSuperscript => {
                const children =
                    compact(element.children?.map(cheerioToSpan)) ?? []
                return { spanType: "span-superscript", children }
            })
            .with("sub", (): SpanSubscript => {
                const children =
                    compact(element.children?.map(cheerioToSpan)) ?? []
                return { spanType: "span-subscript", children }
            })
            .with("u", (): SpanUnderline => {
                const children =
                    compact(element.children?.map(cheerioToSpan)) ?? []
                return { spanType: "span-underline", children }
            })
            .with("wbr", () => spanFallback(element))
            .otherwise(() => {
                return undefined
            })
    }
    return undefined
}

//#endregion

//#region block level elements

/** This type enumerates the errors that can come up during Html to Enriched
    block parsing. Using a union of string literals here is a bit of an experiment
    to give you both human readable titles and a closed set of options for
    exhaustivness checking when handling errors */
type ErrorNames =
    | "blockquote content is not just text"
    | "too many figcaption elements"
    | "too many figcaption elements after archieml transform"
    | "too many figcaption elements after archieml transform"
    | "figcaption element is not structured text"
    | "unkown element tag"
    | "expected only plain text"
    | "exepcted a single plain text element, got more than one"
    | "exepcted a single plain text element, got zero"
    | "iframe without src"
    | "no img element in figure"
    | "iframe with src that is not a grapher"
    | "too many elements in figure"
    | "img without src"
    | "unexpected elements in p"
    | "unexpected elements in list item"
    | "ul without children"
    | "columns item needs to have 2 children"
    | "expected only text inside heading"
    | "unexpected wp component tag"
    | "columns block expects 2 children"
    | "columns block expects children to be column components"
    | "ol without children"
    | "unhandled html tag found"

interface BlockParseError {
    name: ErrorNames

    details: string
}

interface BlockParseResult<T> {
    errors: BlockParseError[]
    content: T[]
}
interface WpComponent {
    tagName: string
    attributes: Record<string, unknown> | undefined
    canHaveChildren: boolean
    childrenResults: ArchieBlockOrWpComponent[]
}

type ArchieBlockOrWpComponent = OwidEnrichedArticleBlock | WpComponent

/** This type is used to keep track of intermediate results when parsing WpComponents where
    we have to keep track of the remaining elements (i.e. those that have not been consumed yet) */
interface WpComponentIntermediateParseResult {
    result: BlockParseResult<ArchieBlockOrWpComponent>
    remainingElements: CheerioElement[]
}

/** Regular expression to identify wordpress components in html components. These
    components always have the structure
    wp:TAGNAME {"optionalAttributeExample": 4}
    This regex parses this structure and captures the groups tag (tagname), attributes
    (optional JSON attributes) and isEmptyElement which indicates if the comment ends with
    /--> to indicate an empty wp component, i.e. one without a matching closing tag similar
    to some html tags like <br />
    */
const wpTagRegex =
    /wp:(?<tag>([\w\/-]+))\s*(?<attributes>{.*})?\s*(?<isEmptyElement>\/)?$/

/** Unwraps a CheerioElement in the sense that it applies cheerioelementsToArchieML
    on the children, returning the result. In effect this "removes" an html element
    like a div that we don't care about in it's own, and where instead we just want to handle
    the children. */
function unwrapElement(
    element: CheerioElement,
    $: CheerioStatic
): BlockParseResult<ArchieBlockOrWpComponent> {
    const result = cheerioElementsToArchieML(element.children, $)
    return result
}

function isWpComponentStart(element: CheerioElement): boolean {
    return (
        element.type === "comment" &&
        (element.data?.trimStart()?.startsWith("wp:") ?? false)
    )
}

function isWpComponentEnd(element: CheerioElement): boolean {
    return (
        element.type === "comment" &&
        (element.data?.trimStart()?.startsWith("/wp:") ?? false)
    )
}

function getWpComponentDetails(element: CheerioElement): WpComponent {
    const match = element.data?.match(wpTagRegex)
    if (!match) throw new Error("WpComponent could not match")
    const attributes =
        match.groups?.attributes && match.groups.attributes.trim() !== ""
            ? JSON.parse(match.groups?.attributes ?? "")
            : undefined
    return {
        tagName: match.groups!.tag!,
        attributes,
        canHaveChildren: match.groups?.isEmptyElement === undefined,
        childrenResults: [],
    }
}

function checkIsWpComponentOfType(
    blockOrComponent: ArchieBlockOrWpComponent,
    expectedTagName: string
): WpComponent | undefined {
    return !("tagName" in blockOrComponent) ||
        blockOrComponent.tagName !== expectedTagName
        ? undefined
        : blockOrComponent
}

export function convertAllWpComponentsToArchieMLBlocks(
    blocksOrComponents: ArchieBlockOrWpComponent[]
): OwidEnrichedArticleBlock[] {
    return blocksOrComponents.flatMap((blockOrComponent) => {
        if ("type" in blockOrComponent) return [blockOrComponent]
        else {
            return convertAllWpComponentsToArchieMLBlocks(
                blockOrComponent.childrenResults
            )
        }
    })
}

/** Parse a Wordpress component. This function has to be called when the first element of
    elements contains a comment that is a WpComponent start tag. It then iterates through
    the list of elements until it finds the matching closing comment tag and returns the
    found component as well as the list of elements that were not consumed in parsing the
    wp component.

    Nested components are properly taken care of - if it should find e.g.:
    <-- wp:column -->
    <-- wp:column -->
    <-- /wp:column -->
    <-- /wp:column -->

    then the result will be one component nested in another. Whether components are parsed
    as WpComponent or directly as an OwidEnrichedArticleBlock depends on whether we have all
    the information we need to created an OwidEnrichedArticleBlock or if we need to keep the
    temporary structure of a WpCompnent around (e.g. the latter is the case for wp:column
    contained inside wp:columns)
     */
function parseWpComponent(
    elements: CheerioElement[],
    $: CheerioStatic
): WpComponentIntermediateParseResult {
    // Below are tags we don't want to try and track as components but just fully ignore -
    // the reason for this is that in some cases they have come up not matching and they
    // don't contain structure that we need to parse
    const wpComponentTagsToIgnore = ["html"]

    const startElement = elements[0]
    if (!isWpComponentStart(startElement))
        throw new Error(
            "Tried to start parsing a WP component on a non-comment block!"
        )
    const componentDetails = getWpComponentDetails(startElement)

    let remainingElements = elements.slice(1)
    const collectedContent: BlockParseResult<ArchieBlockOrWpComponent>[] = []
    // If the wp component tag was closing (ended with /--> ) or if this is a component
    // tag that we want to ignore then don't try to find a closing tag
    if (
        !componentDetails.canHaveChildren ||
        wpComponentTagsToIgnore.indexOf(componentDetails.tagName) > -1
    )
        return {
            remainingElements,
            result: {
                errors: [],
                content: [componentDetails],
            },
        }
    // Now iterate until we find the matching closing tag. If we find an opening wp:component
    // tag then start a new recursive parseWpComponent call
    else
        while (remainingElements.length > 0) {
            const element = remainingElements[0]
            if (isWpComponentEnd(element)) {
                const closingDetails = getWpComponentDetails(element)
                if (
                    wpComponentTagsToIgnore.indexOf(closingDetails.tagName) > -1
                ) {
                    remainingElements = remainingElements.slice(1)
                    continue
                }

                if (closingDetails.tagName !== componentDetails.tagName) {
                    throw new Error(
                        `Found a closing tag (${closingDetails.tagName}) that did not match the expected open tag (${componentDetails.tagName})`
                    )
                }
                const collectedChildren =
                    joinBlockParseResults(collectedContent)

                return {
                    result: finishWpComponent(
                        componentDetails,
                        withoutEmptyOrWhitespaceOnlyTextBlocks(
                            collectedChildren
                        )
                    ),
                    remainingElements: remainingElements.slice(1),
                }
            } else if (isWpComponentStart(element)) {
                const result = parseWpComponent(remainingElements, $)
                remainingElements = result.remainingElements
                collectedContent.push(result.result)
            } else {
                const parsed = cheerioToArchieML(element, $)
                collectedContent.push(parsed)
                remainingElements = remainingElements.slice(1)
            }
        }
    throw new Error(
        `Tried parsing a WP component but never found a matching end tag for ${componentDetails.tagName}`
    )
}

/** Handles finishing a partially parsed WpComponent when we get to the closing tag. When
    a tag contains all the information needed to turn it into an OwidEnrichedArticleBlock then
    we create that - otherwise we keep the WpComponent around with the children content filled in */
function finishWpComponent(
    details: WpComponent,
    content: BlockParseResult<ArchieBlockOrWpComponent>
): BlockParseResult<ArchieBlockOrWpComponent> {
    return match(details.tagName)
        .with("column", (): BlockParseResult<ArchieBlockOrWpComponent> => {
            return {
                content: [
                    {
                        ...details,
                        childrenResults: content.content,
                    },
                ],
                errors: content.errors,
            }
        })
        .with("columns", () => {
            const errors = content.errors
            if (content.content.length !== 2) {
                errors.push({
                    name: "columns block expects 2 children",
                    details: `Got ${content.content.length} children instead`,
                })
                return { ...content, errors }
            }
            const firstChild = checkIsWpComponentOfType(
                content.content[0],
                "column"
            )
            if (firstChild === undefined) {
                errors.push({
                    name: "columns block expects children to be column components",
                    details: `Got ${firstChild} child instead`,
                })
                return { ...content, errors }
            }
            const secondChild = checkIsWpComponentOfType(
                content.content[1],
                "column"
            )
            if (secondChild === undefined) {
                errors.push({
                    name: "columns block expects children to be column components",
                    details: `Got ${secondChild} child instead`,
                })
                return { ...content, errors }
            }
            return {
                errors,
                content: [
                    {
                        type: "sticky-right",
                        left: convertAllWpComponentsToArchieMLBlocks(
                            firstChild.childrenResults
                        ),
                        right: convertAllWpComponentsToArchieMLBlocks(
                            secondChild.childrenResults
                        ),
                        parseErrors: [],
                    } as EnrichedBlockStickyRightContainer,
                ],
            }
        })
        .with("paragraph", () => {
            return content
        })
        .otherwise(() => {
            return {
                errors: [
                    ...content.errors,
                    {
                        name: "unexpected wp component tag",
                        details: `Found unexpected tag ${details.tagName}`,
                    },
                ],
                content: content.content,
            }
        })
}

function isEnrichedTextBlock(
    item: ArchieBlockOrWpComponent
): item is EnrichedBlockText {
    return "type" in item && item.type === "text"
}

function cheerioToArchieML(
    element: CheerioElement,
    $: CheerioStatic
): BlockParseResult<ArchieBlockOrWpComponent> {
    if (element.type === "comment") return { errors: [], content: [] }

    const unwrapElementWithContext = (element: CheerioElement) =>
        unwrapElement(element, $)

    const span = cheerioToSpan(element)
    if (span)
        return {
            errors: [],
            // TODO: below should be a list of spans and a rich text block
            content: [{ type: "text", value: [span], parseErrors: [] }],
        }
    else if (element.type === "tag") {
        const result: BlockParseResult<ArchieBlockOrWpComponent> = match(
            element
        )
            .with({ tagName: "address" }, unwrapElementWithContext)
            .with(
                { tagName: "blockquote" },
                (): BlockParseResult<EnrichedBlockPullQuote> => {
                    const spansResult = getSimpleTextSpansFromChildren(
                        element, //bla
                        $
                    )

                    return {
                        errors: spansResult.errors,
                        content: [
                            {
                                type: "pull-quote",
                                // TODO: this is incomplete - needs to match to all text-ish elements like StructuredText
                                text: spansResult.content,
                                parseErrors: [],
                            },
                        ],
                    }
                }
            )
            .with({ tagName: "body" }, unwrapElementWithContext)
            .with({ tagName: "center" }, unwrapElementWithContext) // might want to translate this to a block with a centered style?
            .with({ tagName: "details" }, unwrapElementWithContext)
            .with({ tagName: "div" }, unwrapElementWithContext)
            .with({ tagName: "figcaption" }, unwrapElementWithContext)
            .with(
                { tagName: "figure" },
                (): BlockParseResult<ArchieBlockOrWpComponent> => {
                    const errors: BlockParseError[] = []
                    const [figcaptionChildren, otherChildren] = partition(
                        element.children,
                        (n) => n.tagName === "figcaption"
                    )
                    let figcaptionElement: EnrichedBlockText | undefined =
                        undefined
                    if (figcaptionChildren.length > 1) {
                        errors.push({
                            name: "too many figcaption elements",
                            details: `Found ${figcaptionChildren.length} elements`,
                        })
                    } else {
                        const figCaption =
                            figcaptionChildren.length > 0
                                ? cheerioElementsToArchieML(
                                      figcaptionChildren,
                                      $
                                  )
                                : undefined
                        if (figCaption)
                            if (figCaption.content.length > 1)
                                errors.push({
                                    name: "too many figcaption elements after archieml transform",
                                    details: `Found ${figCaption.content.length} elements after transforming to archieml`,
                                })
                            else {
                                const element = figCaption.content[0]
                                if (isEnrichedTextBlock(element))
                                    figcaptionElement = element
                                else
                                    errors.push({
                                        name: "figcaption element is not structured text",
                                        details: `Found ${
                                            "type" in element
                                                ? element.type
                                                : ""
                                        } element after transforming to archieml`,
                                    })
                            }
                    }
                    if (otherChildren.length > 1)
                        errors.push({
                            name: "too many elements in figure",
                            details: `Found ${otherChildren.length} elements`,
                        })
                    const image = findCheerioElementRecursive(
                        otherChildren,
                        "img"
                    )
                    if (!image) {
                        if (otherChildren[0].tagName === "table") {
                            const childResult = cheerioToArchieML(
                                otherChildren[0],
                                $
                            )

                            return {
                                errors: [...errors, ...childResult.errors],
                                content: childResult.content,
                            }
                        }
                        // TODO: this is a legitimate case, there may be other content in a figure
                        // but for now we treat it as an error and see how often this error happens
                        errors.push({
                            name: "no img element in figure",
                            details: `Found ${otherChildren.length} elements`,
                        })
                    }

                    return {
                        errors,
                        content: [
                            {
                                type: "image",
                                src: image?.attribs.src ?? "",
                                caption: figcaptionElement?.value ?? [],
                                parseErrors: [],
                            },
                        ],
                    }
                }
            )
            .with(
                { tagName: P.union("h1", "h2", "h3", "h4", "h5", "h6") },
                (): BlockParseResult<EnrichedBlockHeading> => {
                    const level = parseInt(element.tagName.slice(1))
                    const spansResult = getSpansFromChildren(element, $)
                    const errors = spansResult.errors
                    if (spansResult.content.length == 0)
                        errors.push({
                            name: "exepcted a single plain text element, got zero" as const,
                            details: `Found ${spansResult.content.length} elements after transforming to archieml`,
                        })
                    return {
                        errors: spansResult.errors,
                        content: [
                            {
                                type: "heading",
                                level: level,
                                text: spansResult.content,
                                parseErrors: [],
                            },
                        ],
                    }
                }
            )
            .with(
                { tagName: "iframe" },
                (): BlockParseResult<EnrichedBlockChart> => {
                    const src = element.attribs.src
                    const errors: BlockParseError[] = []
                    if (!src)
                        errors.push({
                            name: "iframe without src" as const,
                            details: `Found iframe without src attribute`,
                        })
                    if (!src?.startsWith("https://ourworldindata.org/grapher/"))
                        errors.push({
                            name: "iframe with src that is not a grapher",
                            details: `Found iframe with src that is not a grapher`,
                        })
                    return {
                        errors: errors,
                        content: [
                            {
                                type: "chart",
                                url: src,
                                parseErrors: [],
                            },
                        ],
                    }
                }
            )
            .with(
                { tagName: "img" },
                (): BlockParseResult<EnrichedBlockImage> => {
                    const src = element.attribs.src
                    const errors: BlockParseError[] = []
                    if (!src)
                        errors.push({
                            name: "img without src" as const,
                            details: `Found img without src attribute`,
                        })
                    return {
                        errors: errors,
                        content: [
                            {
                                type: "image",
                                src: src,
                                caption: [],
                                parseErrors: [],
                            },
                        ],
                    }
                }
            )
            .with({ tagName: "p" }, (): BlockParseResult<EnrichedBlockText> => {
                const children = cheerioElementsToArchieML(element.children, $)

                const [textChildren, otherChildren] = partition(
                    children.content,
                    isEnrichedTextBlock
                )
                const errors = children.errors
                if (otherChildren.length > 0)
                    errors.push({
                        name: "unexpected elements in p",
                        details: `Found ${otherChildren.length} elements`,
                    })
                return {
                    errors: errors,
                    content: [
                        {
                            type: "text",
                            value: textChildren.flatMap((child) => child.value),
                            parseErrors: [],
                        },
                    ],
                }
            })
            .with(
                { tagName: "ul" },
                (): BlockParseResult<EnrichedBlockList> => {
                    const children = element.children?.flatMap((child) => {
                        if (!child.children) return []
                        const grandChildren = cheerioElementsToArchieML(
                            child.children,
                            $
                        )
                        if (grandChildren.content) return [grandChildren]
                        else return []
                    })

                    if (!children)
                        return {
                            errors: [
                                {
                                    name: "ul without children" as const,
                                    details: `Found ul without children`,
                                },
                            ],
                            content: [],
                        }

                    const handleListChildren = (
                        listContent: BlockParseResult<ArchieBlockOrWpComponent>
                    ): BlockParseResult<EnrichedBlockText> => {
                        const [textChildren, otherChildren] = partition(
                            listContent.content,
                            isEnrichedTextBlock
                        )
                        const errors = listContent.errors
                        if (otherChildren.length > 0)
                            errors.push({
                                name: "unexpected elements in list item",
                                details: `Found ${otherChildren.length} elements`,
                            })
                        return {
                            errors: errors,
                            content: [
                                {
                                    type: "text",
                                    value: textChildren.flatMap(
                                        (child) => child.value
                                    ),
                                    parseErrors: [],
                                },
                            ],
                        }
                    }

                    const listChildren = joinBlockParseResults(
                        children.map(handleListChildren)
                    )
                    return {
                        errors: listChildren.errors,
                        content: [
                            {
                                type: "list",
                                items: listChildren.content,
                                parseErrors: [],
                            },
                        ],
                    }
                }
            )
            .with(
                { tagName: "ol" },
                (): BlockParseResult<EnrichedBlockNumberedList> => {
                    const children = element.children?.flatMap((child) => {
                        const grandChildren = cheerioElementsToArchieML(
                            child.children,
                            $
                        )
                        if (grandChildren.content) return [grandChildren]
                        else return []
                    })

                    if (!children)
                        return {
                            errors: [
                                {
                                    name: "ol without children" as const,
                                    details: `Found ol without children`,
                                },
                            ],
                            content: [],
                        }

                    const handleListChildren = (
                        listContent: BlockParseResult<ArchieBlockOrWpComponent>
                    ): BlockParseResult<EnrichedBlockText> => {
                        const [textChildren, otherChildren] = partition(
                            listContent.content,
                            isEnrichedTextBlock
                        )
                        const errors = listContent.errors
                        if (otherChildren.length > 0)
                            errors.push({
                                name: "unexpected elements in list item",
                                details: `Found ${otherChildren.length} elements`,
                            })
                        return {
                            errors: errors,
                            content: [
                                {
                                    type: "text",
                                    value: textChildren.flatMap(
                                        (child) => child.value
                                    ),
                                    parseErrors: [],
                                },
                            ],
                        }
                    }

                    const listChildren = joinBlockParseResults(
                        children.map(handleListChildren)
                    )
                    return {
                        errors: listChildren.errors,
                        content: [
                            {
                                type: "numbered-list",
                                items: listChildren.content,
                                parseErrors: [],
                            },
                        ],
                    }
                }
            )
            .with(
                { tagName: P.union("svg", "table", "video") },
                (): BlockParseResult<EnrichedBlockHtml> => {
                    return {
                        errors: [],
                        content: [
                            {
                                type: "html",
                                value: $.html(element) ?? "",
                                parseErrors: [],
                            },
                        ],
                    }
                }
            )
            .otherwise(() => ({
                errors: [
                    {
                        name: "unhandled html tag found",
                        details: `Encountered the unhandled tag ${element.tagName}`,
                    },
                ],
                content: [],
            }))
        return result
    } else
        return {
            errors: [
                {
                    name: "unkown element tag",
                    details: `type was ${element.type}`,
                },
            ],
            content: [],
        }
}

export function cheerioElementsToArchieML(
    elements: CheerioElement[],
    $: CheerioStatic
): BlockParseResult<ArchieBlockOrWpComponent> {
    if (!elements)
        return {
            errors: [],
            content: [],
        }
    let remainingElements: CheerioElement[] = elements
    const parsedContent: BlockParseResult<ArchieBlockOrWpComponent>[] = []
    while (remainingElements.length > 0) {
        const element = remainingElements[0]
        if (isWpComponentStart(element)) {
            const parseResult = parseWpComponent(remainingElements, $)
            parsedContent.push(parseResult.result)
            remainingElements = parseResult.remainingElements
        } else if (element.type === "comment") {
            remainingElements = remainingElements.slice(1)
        } else {
            const parsed = cheerioToArchieML(element, $)
            const cleaned = withoutEmptyOrWhitespaceOnlyTextBlocks(parsed)
            if (cleaned.content.length > 0 || cleaned.errors.length > 0)
                parsedContent.push(parsed)
            remainingElements = remainingElements.slice(1)
        }
    }
    return joinBlockParseResults(parsedContent)
}

export function withoutEmptyOrWhitespaceOnlyTextBlocks(
    result: BlockParseResult<ArchieBlockOrWpComponent>
): BlockParseResult<ArchieBlockOrWpComponent> {
    return {
        ...result,
        content: result.content.filter(
            (element) =>
                !("type" in element) ||
                ("type" in element && element.type !== "text") ||
                (element.value.length > 0 &&
                    element.value.some(
                        (span) =>
                            span.spanType !== "span-simple-text" ||
                            span.text.trimStart() !== ""
                    ))
        ),
    }
}

function emptyBlockParseResult<T>(): BlockParseResult<T> {
    return { errors: [], content: [] }
}

/** Joins an array of BlockParseResults into a single one by
    flattening the errors and content arrays inside of them. */
function joinBlockParseResults<T>(
    results: BlockParseResult<T>[]
): BlockParseResult<T> {
    const errors = flatten(results.map((r) => r.errors))
    const content = flatten(results.map((r) => r.content))
    return { errors, content }
}

function findCheerioElementRecursive(
    elements: CheerioElement[],
    tagName: string
): CheerioElement | undefined {
    for (const element of elements) {
        if (element.tagName === tagName) return element
        else {
            const result = findCheerioElementRecursive(
                element.children ?? [],
                tagName
            )
            if (result !== undefined) return result
        }
    }
    return undefined
}

function getSimpleSpans(spans: Span[]): [SpanSimpleText[], Span[]] {
    return partition(
        spans,
        (span: Span): span is SpanSimpleText =>
            span.spanType === "span-simple-text"
    )
}

function getSimpleTextSpansFromChildren(
    element: CheerioElement,
    $: CheerioStatic
): BlockParseResult<SpanSimpleText> {
    const spansResult = getSpansFromChildren(element, $)
    const [simpleSpans, otherSpans] = getSimpleSpans(spansResult.content)
    const errors =
        otherSpans.length === 0
            ? spansResult.errors
            : [
                  ...spansResult.errors,
                  {
                      name: "expected only plain text" as const,
                      details: `suppressed tags: ${otherSpans
                          .map((s) => s.spanType)
                          .join(", ")}`,
                  },
              ]
    return {
        errors,
        content: simpleSpans,
    }
}

function getSpansFromChildren(
    element: CheerioElement,
    $: CheerioStatic
): BlockParseResult<Span> {
    const childElements = joinBlockParseResults(
        element.children.map((child) => cheerioToArchieML(child, $))
    )

    const [textChildren, otherChildren] = partition(
        childElements.content,
        isEnrichedTextBlock
    )

    const spans = textChildren.flatMap((text) => text.value)

    const errors =
        spans.length === 0
            ? childElements.errors
            : [
                  ...childElements.errors,
                  {
                      name: "expected only text inside heading" as const,
                      details: `suppressed tags: ${otherChildren
                          .map((c) => ("type" in c && c.type) ?? "")
                          .join(", ")}`,
                  },
              ]
    return {
        errors: errors,
        content: spans,
    }
}

//#endregion
