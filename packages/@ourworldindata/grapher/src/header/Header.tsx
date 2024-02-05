import React from "react"
import { DEFAULT_BOUNDS, range, LogoOption } from "@ourworldindata/utils"
import { MarkdownTextWrap, TextWrap } from "@ourworldindata/components"
import { computed } from "mobx"
import { observer } from "mobx-react"
import { Logo } from "../captionedChart/Logos"

import { HeaderManager } from "./HeaderManager"
import {
    BASE_FONT_SIZE,
    DEFAULT_GRAPHER_FRAME_PADDING,
    GRAPHER_DARK_TEXT,
} from "../core/GrapherConstants"

interface HeaderProps {
    manager: HeaderManager
    maxWidth?: number
}

@observer
export class Header<
    Props extends HeaderProps = HeaderProps,
> extends React.Component<Props> {
    @computed protected get manager(): HeaderManager {
        return this.props.manager
    }

    @computed protected get maxWidth(): number {
        return this.props.maxWidth ?? DEFAULT_BOUNDS.width
    }

    @computed private get framePaddingHorizontal(): number {
        return (
            this.manager.framePaddingHorizontal ?? DEFAULT_GRAPHER_FRAME_PADDING
        )
    }

    @computed private get framePaddingVertical(): number {
        return (
            this.manager.framePaddingVertical ?? DEFAULT_GRAPHER_FRAME_PADDING
        )
    }

    @computed protected get useBaseFontSize(): boolean {
        return !!this.manager.useBaseFontSize
    }

    @computed protected get baseFontSize(): number {
        return this.manager.fontSize ?? BASE_FONT_SIZE
    }

    @computed protected get showTitle(): boolean {
        return !this.manager.hideTitle && !!this.titleText
    }

    @computed protected get showSubtitle(): boolean {
        return !this.manager.hideSubtitle && !!this.subtitleText
    }

    @computed protected get titleText(): string {
        return this.manager.currentTitle?.trim() ?? ""
    }

    @computed private get subtitleText(): string {
        return this.manager.currentSubtitle?.trim() ?? ""
    }

    @computed get logo(): Logo | undefined {
        const { manager } = this
        if (manager.hideLogo) return undefined
        const isOwidLogo = !manager.logo || manager.logo === LogoOption.owid
        return new Logo({
            logo: manager.logo as any,
            isLink: !!manager.shouldLinkToOwid,
            // if it's the OWID logo, use the small version; otherwise, decrease the size
            heightScale: manager.isSmall && !isOwidLogo ? 0.775 : 1,
            useSmallVersion: manager.isSmall && isOwidLogo,
        })
    }

    @computed protected get logoWidth(): number {
        return this.logo ? this.logo.width : 0
    }

    @computed private get logoHeight(): number {
        return this.logo ? this.logo.height : 0
    }

    @computed get titleFontSize(): number {
        if (this.useBaseFontSize) {
            return (22 / BASE_FONT_SIZE) * this.baseFontSize
        }
        return this.manager.isNarrow ? 18 : this.manager.isMedium ? 20 : 24
    }

    @computed get titleLineHeight(): number {
        return this.manager.isSmall ? 1.1 : 1.2
    }

    @computed get title(): TextWrap {
        const { logoWidth } = this
        return new TextWrap({
            maxWidth: this.maxWidth - logoWidth - 24,
            fontWeight: 600,
            lineHeight: this.titleLineHeight,
            fontSize: this.titleFontSize,
            text: this.titleText,
        })
    }

    @computed get subtitleMarginTop(): number {
        return 4
    }

    @computed get subtitleWidth(): number {
        // If the subtitle is entirely below the logo, we can go underneath it
        return this.title.height > this.logoHeight
            ? this.maxWidth
            : this.maxWidth - this.logoWidth - 12
    }

    @computed get subtitleFontSize(): number {
        if (this.useBaseFontSize) {
            return (13 / BASE_FONT_SIZE) * this.baseFontSize
        }
        return this.manager.isSmall ? 12 : this.manager.isMedium ? 13 : 14
    }

    @computed get subtitleLineHeight(): number {
        return this.manager.isMedium ? 1.2 : 1.28571
    }

    @computed get subtitle(): MarkdownTextWrap {
        return new MarkdownTextWrap({
            maxWidth: this.subtitleWidth,
            fontSize: this.subtitleFontSize,
            text: this.subtitleText,
            lineHeight: this.subtitleLineHeight,
            detailsOrderedByReference: this.manager.detailsOrderedByReference,
        })
    }

    @computed get height(): number {
        const {
            title,
            subtitle,
            showTitle,
            showSubtitle,
            subtitleMarginTop,
            logoHeight,
        } = this
        return Math.max(
            (showTitle ? title.height : 0) +
                (showSubtitle ? subtitle.height + subtitleMarginTop : 0),
            logoHeight
        )
    }

    private renderTitle(): JSX.Element {
        const { manager } = this

        // avoid linking to a grapher/data page when we're already on it
        if (manager.isOnCanonicalUrl && !this.manager.isInIFrame) {
            return (
                <h1 style={this.title.htmlStyle}>{this.title.renderHTML()}</h1>
            )
        }

        // on smaller screens, make the whole width of the header clickable
        if (manager.isMedium) {
            return (
                <a
                    href={manager.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-track-note="chart_click_title"
                >
                    <h1 style={this.title.htmlStyle}>
                        {this.title.renderHTML()}
                    </h1>
                </a>
            )
        }

        // on larger screens, only make the title text itself clickable
        return (
            <h1 style={this.title.htmlStyle}>
                <a
                    href={manager.canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-track-note="chart_click_title"
                >
                    {this.title.renderHTML()}
                </a>
            </h1>
        )
    }

    private renderSubtitle(): JSX.Element {
        const style = {
            ...this.subtitle.style,
            marginTop: this.subtitleMarginTop,
            // make sure there are no scrollbars on subtitle
            overflowY: "hidden",
        }
        return <p style={style}>{this.subtitle.renderHTML()}</p>
    }

    render(): JSX.Element {
        return (
            <div
                className="HeaderHTML"
                style={{
                    padding: `${this.framePaddingVertical}px ${this.framePaddingHorizontal}px`,
                    paddingBottom: 0,
                }}
            >
                {this.logo && this.logo.renderHTML()}
                {(this.showTitle || this.showSubtitle) && (
                    <div style={{ minHeight: this.height }}>
                        {this.showTitle && this.renderTitle()}
                        {this.showSubtitle && this.renderSubtitle()}
                    </div>
                )}
            </div>
        )
    }
}

interface StaticHeaderProps extends HeaderProps {
    targetX: number
    targetY: number
}

@observer
export class StaticHeader extends Header<StaticHeaderProps> {
    @computed get title(): TextWrap {
        const { logoWidth, titleText } = this

        const makeTitle = (fontSize: number): TextWrap =>
            new TextWrap({
                text: titleText,
                maxWidth: this.maxWidth - logoWidth - 24,
                fontSize,
                fontWeight: 500,
                lineHeight: this.manager.isStaticAndSmall ? 1.1 : 1.2,
            })

        // try to fit the title into a single line if possible-- but not if it would make the text too small
        const initialFontSize = this.useBaseFontSize
            ? (22 / BASE_FONT_SIZE) * this.baseFontSize
            : 24
        let title = makeTitle(initialFontSize)

        // if the title is already a single line, no need to decrease font size
        if (title.lines.length <= 1) return title

        const originalLineCount = title.lines.length
        // decrease the initial font size by no more than 20% using 0.5px steps
        const potentialFontSizes = range(
            initialFontSize,
            initialFontSize * 0.8,
            -0.5
        )
        for (const fontSize of potentialFontSizes) {
            title = makeTitle(fontSize)
            const currentLineCount = title.lines.length
            if (currentLineCount <= 1 || currentLineCount < originalLineCount)
                break
        }
        // return the title at the new font size: either it now fits into a single line, or
        // its size has been reduced so the multi-line title doesn't take up quite that much space
        return title
    }

    @computed get subtitleLineHeight(): number {
        return 1.2
    }

    render(): JSX.Element {
        const { targetX: x, targetY: y } = this.props
        const { title, logo, subtitle, manager, maxWidth } = this
        return (
            <g className="HeaderView">
                {logo &&
                    logo.height > 0 &&
                    logo.renderSVG(x + maxWidth - logo.width, y)}
                {this.showTitle && (
                    <a
                        href={manager.canonicalUrl}
                        style={{
                            fontFamily:
                                "'Playfair Display', Georgia, 'Times New Roman', 'Liberation Serif', serif",
                        }}
                        target="_blank"
                        rel="noopener"
                    >
                        {title.render(x, y, {
                            textProps: { fill: GRAPHER_DARK_TEXT },
                        })}
                    </a>
                )}
                {this.showSubtitle &&
                    subtitle.renderSVG(
                        x,
                        y +
                            (this.showTitle
                                ? title.height + this.subtitleMarginTop
                                : 0),
                        {
                            textProps: {
                                fill: manager.secondaryColorInStaticCharts,
                            },
                            dodMarker: this.manager.detailsMarkerInSvg,
                        }
                    )}
            </g>
        )
    }
}
