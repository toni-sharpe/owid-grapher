import React from "react"
import { sum, max } from "@ourworldindata/utils"
import { TextWrap } from "@ourworldindata/components"
import { computed } from "mobx"
import { observer } from "mobx-react"
import {
    GRAPHER_FONT_SCALE_11_2,
    BASE_FONT_SIZE,
} from "../core/GrapherConstants"
import { Color } from "@ourworldindata/types"

export interface VerticalColorLegendManager {
    maxLegendWidth?: number
    fontSize?: number
    legendItems: LegendItem[]
    legendTitle?: string
    onLegendMouseOver?: (color: string) => void
    onLegendClick?: (color: string) => void
    onLegendMouseLeave?: () => void
    legendX?: number
    legendY?: number
    activeColors: Color[]
    focusColors?: Color[]
}

export interface LegendItem {
    label?: string
    minText?: string
    maxText?: string
    color: Color
}

interface SizedLegendSeries {
    textWrap: TextWrap
    color: Color
    width: number
    height: number
}

@observer
export class VerticalColorLegend extends React.Component<{
    manager: VerticalColorLegendManager
}> {
    @computed get manager(): VerticalColorLegendManager {
        return this.props.manager
    }

    @computed private get maxLegendWidth(): number {
        return this.manager.maxLegendWidth ?? 100
    }

    @computed private get fontSize(): number {
        return (
            GRAPHER_FONT_SCALE_11_2 * (this.manager.fontSize ?? BASE_FONT_SIZE)
        )
    }
    @computed private get rectSize(): number {
        return Math.round(this.fontSize / 1.4)
    }

    private rectPadding = 5
    private lineHeight = 5

    @computed private get title(): TextWrap | undefined {
        if (!this.manager.legendTitle) return undefined
        return new TextWrap({
            maxWidth: this.maxLegendWidth,
            fontSize: this.fontSize,
            fontWeight: 700,
            lineHeight: 1,
            text: this.manager.legendTitle,
        })
    }

    @computed private get titleHeight(): number {
        if (!this.title) return 0
        return this.title.height + 5
    }

    @computed private get series(): SizedLegendSeries[] {
        const { manager, fontSize, rectSize, rectPadding } = this

        return manager.legendItems
            .map((series) => {
                let label = series.label
                // infer label for numeric bins
                if (!label && series.minText && series.maxText) {
                    label = `${series.minText} – ${series.maxText}`
                }
                const textWrap = new TextWrap({
                    maxWidth: this.maxLegendWidth,
                    fontSize,
                    lineHeight: 1,
                    text: label ?? "",
                })
                return {
                    textWrap,
                    color: series.color,
                    width: rectSize + rectPadding + textWrap.width,
                    height: Math.max(textWrap.height, rectSize),
                }
            })
            .filter((v) => !!v) as SizedLegendSeries[]
    }

    @computed get width(): number {
        const widths = this.series.map((series) => series.width)
        if (this.title) widths.push(this.title.width)
        return max(widths) ?? 0
    }

    @computed get height(): number {
        return (
            this.titleHeight +
            sum(this.series.map((series) => series.height)) +
            this.lineHeight * this.series.length
        )
    }

    render(): JSX.Element {
        const {
            title,
            titleHeight,
            series,
            rectSize,
            rectPadding,
            lineHeight,
            manager,
        } = this
        const {
            focusColors,
            activeColors,
            onLegendMouseOver,
            onLegendMouseLeave,
            onLegendClick,
        } = manager

        const x = manager.legendX ?? 0
        const y = manager.legendY ?? 0

        let markOffset = titleHeight

        return (
            <>
                {title &&
                    title.render(x, y, { textProps: { fontWeight: 700 } })}
                <g
                    className="ScatterColorLegend clickable"
                    style={{ cursor: "pointer" }}
                >
                    {series.map((series, index) => {
                        const isActive = activeColors.includes(series.color)
                        const isFocus =
                            focusColors?.includes(series.color) ?? false
                        const mouseOver = onLegendMouseOver
                            ? (): void => onLegendMouseOver(series.color)
                            : undefined
                        const mouseLeave = onLegendMouseLeave || undefined
                        const click = onLegendClick
                            ? (): void => onLegendClick(series.color)
                            : undefined

                        const result = (
                            <g
                                key={index}
                                className="legendMark"
                                onMouseOver={mouseOver}
                                onMouseLeave={mouseLeave}
                                onClick={click}
                                fill={!isActive ? "#ccc" : undefined}
                            >
                                <rect
                                    x={x}
                                    y={y + markOffset - lineHeight / 2}
                                    width={series.width}
                                    height={series.height + lineHeight}
                                    fill="#fff"
                                    opacity={0}
                                />
                                <rect
                                    x={x}
                                    y={
                                        y +
                                        markOffset +
                                        (series.height - rectSize) / 2
                                    }
                                    width={rectSize}
                                    height={rectSize}
                                    fill={isActive ? series.color : undefined}
                                />
                                {series.textWrap.render(
                                    x + rectSize + rectPadding,
                                    y + markOffset,
                                    isFocus
                                        ? {
                                              textProps: {
                                                  style: { fontWeight: "bold" },
                                              },
                                          }
                                        : undefined
                                )}
                            </g>
                        )

                        markOffset += series.height + lineHeight
                        return result
                    })}
                </g>
            </>
        )
    }
}
