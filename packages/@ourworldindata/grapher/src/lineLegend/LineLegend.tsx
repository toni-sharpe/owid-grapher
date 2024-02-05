// This implements the line labels that appear to the right of the lines/polygons in LineCharts/StackedAreas.
import React from "react"
import {
    Bounds,
    noop,
    cloneDeep,
    max,
    min,
    sortBy,
    sumBy,
    flatten,
} from "@ourworldindata/utils"
import { TextWrap } from "@ourworldindata/components"
import { computed } from "mobx"
import { observer } from "mobx-react"
import { VerticalAxis } from "../axis/Axis"
import { EntityName } from "@ourworldindata/types"
import { BASE_FONT_SIZE, GRAPHER_FONT_SCALE_12 } from "../core/GrapherConstants"
import { ChartSeries } from "../chart/ChartInterface"
import { darkenColorForText } from "../color/ColorUtils"

// Minimum vertical space between two legend items
const LEGEND_ITEM_MIN_SPACING = 2
// Horizontal distance from the end of the chart to the start of the marker
const MARKER_MARGIN = 4

const DEFAULT_FONT_WEIGHT = 400

export interface LineLabelSeries extends ChartSeries {
    label: string
    yValue: number
    annotation?: string
    yRange?: [number, number]
}

interface SizedSeries extends LineLabelSeries {
    textWrap: TextWrap
    annotationTextWrap?: TextWrap
    width: number
    height: number
}

interface PlacedSeries extends SizedSeries {
    origBounds: Bounds
    bounds: Bounds
    isOverlap: boolean
    repositions: number
    level: number
    totalLevels: number
}

function groupBounds(group: PlacedSeries[]): Bounds {
    const first = group[0]
    const last = group[group.length - 1]
    const height = last.bounds.bottom - first.bounds.top
    const width = Math.max(first.bounds.width, last.bounds.width)
    return new Bounds(first.bounds.x, first.bounds.y, width, height)
}

function stackGroupVertically(
    group: PlacedSeries[],
    y: number
): PlacedSeries[] {
    let currentY = y
    group.forEach((mark) => {
        mark.bounds = mark.bounds.set({ y: currentY })
        mark.repositions += 1
        currentY += mark.bounds.height + LEGEND_ITEM_MIN_SPACING
    })
    return group
}

@observer
class Label extends React.Component<{
    series: PlacedSeries
    manager: LineLegend
    isFocus?: boolean
    needsLines?: boolean
    onMouseOver: () => void
    onClick: () => void
    onMouseLeave?: () => void
}> {
    render(): JSX.Element {
        const {
            series,
            manager,
            isFocus,
            needsLines,
            onMouseOver,
            onMouseLeave,
            onClick,
        } = this.props
        const x = series.origBounds.x
        const markerX1 = x + MARKER_MARGIN
        const markerX2 = x + manager.leftPadding - MARKER_MARGIN
        const step = (markerX2 - markerX1) / (series.totalLevels + 1)
        const markerXMid = markerX1 + step + series.level * step
        const lineColor = isFocus ? "#999" : "#eee"
        const textColor = isFocus ? darkenColorForText(series.color) : "#ddd"
        const annotationColor = isFocus ? "#333" : "#ddd"
        return (
            <g
                className="legendMark"
                onMouseOver={onMouseOver}
                onMouseLeave={onMouseLeave}
                onClick={onClick}
            >
                {needsLines && (
                    <g className="indicator">
                        <path
                            d={`M${markerX1},${series.origBounds.centerY} H${markerXMid} V${series.bounds.centerY} H${markerX2}`}
                            stroke={lineColor}
                            strokeWidth={0.5}
                            fill="none"
                        />
                    </g>
                )}
                <rect
                    x={x}
                    y={series.bounds.y}
                    width={series.bounds.width}
                    height={series.bounds.height}
                    fill="#fff"
                    opacity={0}
                />
                {series.textWrap.render(
                    needsLines ? markerX2 + MARKER_MARGIN : markerX1,
                    series.bounds.y,
                    { textProps: { fill: textColor } }
                )}
                {series.annotationTextWrap &&
                    series.annotationTextWrap.render(
                        needsLines ? markerX2 + MARKER_MARGIN : markerX1,
                        series.bounds.y + series.textWrap.height,
                        {
                            textProps: {
                                fill: annotationColor,
                                className: "textAnnotation",
                                style: { fontWeight: 300 },
                            },
                        }
                    )}
            </g>
        )
    }
}

export interface LineLegendManager {
    startSelectingWhenLineClicked?: boolean
    canAddData?: boolean
    isSelectingData?: boolean
    entityType?: string
    labelSeries: LineLabelSeries[]
    maxLineLegendWidth?: number
    fontSize?: number
    fontWeight?: number
    onLineLegendMouseOver?: (key: EntityName) => void
    onLineLegendClick?: (key: EntityName) => void
    onLineLegendMouseLeave?: () => void
    focusedSeriesNames: EntityName[]
    yAxis: VerticalAxis
    lineLegendX?: number
}

@observer
export class LineLegend extends React.Component<{
    manager: LineLegendManager
}> {
    leftPadding = 35

    @computed private get fontSize(): number {
        return GRAPHER_FONT_SCALE_12 * (this.manager.fontSize ?? BASE_FONT_SIZE)
    }

    @computed private get fontWeight(): number {
        return this.manager.fontWeight ?? DEFAULT_FONT_WEIGHT
    }

    @computed private get maxWidth(): number {
        return this.manager.maxLineLegendWidth ?? 300
    }

    @computed.struct get sizedLabels(): SizedSeries[] {
        const { fontSize, fontWeight, leftPadding, maxWidth } = this
        const maxTextWidth = maxWidth - leftPadding
        const maxAnnotationWidth = Math.min(maxTextWidth, 150)

        return this.manager.labelSeries.map((label) => {
            const annotationTextWrap = label.annotation
                ? new TextWrap({
                      text: label.annotation,
                      maxWidth: maxAnnotationWidth,
                      fontSize: fontSize * 0.9,
                      lineHeight: 1,
                  })
                : undefined
            const textWrap = new TextWrap({
                text: label.label,
                maxWidth: maxTextWidth,
                fontSize,
                fontWeight,
                lineHeight: 1,
            })
            return {
                ...label,
                textWrap,
                annotationTextWrap,
                width:
                    leftPadding +
                    Math.max(
                        textWrap.width,
                        annotationTextWrap ? annotationTextWrap.width : 0
                    ),
                height:
                    textWrap.height +
                    (annotationTextWrap ? annotationTextWrap.height : 0),
            }
        })
    }

    @computed get width(): number {
        if (this.sizedLabels.length === 0) return 0
        return max(this.sizedLabels.map((d) => d.width)) ?? 0
    }

    @computed get onMouseOver(): any {
        return this.manager.onLineLegendMouseOver ?? noop
    }
    @computed get onMouseLeave(): any {
        return this.manager.onLineLegendMouseLeave ?? noop
    }
    @computed get onClick(): any {
        return this.manager.onLineLegendClick ?? noop
    }

    @computed get isFocusMode(): boolean {
        return this.sizedLabels.some((label) =>
            this.manager.focusedSeriesNames.includes(label.seriesName)
        )
    }

    @computed get legendX(): number {
        return this.manager.lineLegendX ?? 0
    }

    // Naive initial placement of each mark at the target height, before collision detection
    @computed private get initialSeries(): PlacedSeries[] {
        const { yAxis } = this.manager
        const { legendX } = this

        return sortBy(
            this.sizedLabels.map((label) => {
                // place vertically centered at Y value
                const initialY = yAxis.place(label.yValue) - label.height / 2
                const origBounds = new Bounds(
                    legendX,
                    initialY,
                    label.width,
                    label.height
                )

                // ensure label doesn't go beyond the top or bottom of the chart
                const y = Math.min(
                    Math.max(initialY, yAxis.rangeMin),
                    yAxis.rangeMax - label.height
                )
                const bounds = new Bounds(legendX, y, label.width, label.height)

                return {
                    ...label,
                    y,
                    origBounds,
                    bounds,
                    isOverlap: false,
                    repositions: 0,
                    level: 0,
                    totalLevels: 0,
                }

                // Ensure list is sorted by the visual position in ascending order
            }),
            (label) => yAxis.place(label.yValue)
        )
    }

    @computed get standardPlacement(): PlacedSeries[] {
        const { yAxis } = this.manager

        const groups: PlacedSeries[][] = cloneDeep(this.initialSeries).map(
            (mark) => [mark]
        )

        let hasOverlap

        do {
            hasOverlap = false
            for (let i = 0; i < groups.length - 1; i++) {
                const topGroup = groups[i]
                const bottomGroup = groups[i + 1]
                const topBounds = groupBounds(topGroup)
                const bottomBounds = groupBounds(bottomGroup)
                if (topBounds.intersects(bottomBounds)) {
                    const overlapHeight =
                        topBounds.bottom -
                        bottomBounds.top +
                        LEGEND_ITEM_MIN_SPACING
                    const newHeight =
                        topBounds.height +
                        LEGEND_ITEM_MIN_SPACING +
                        bottomBounds.height
                    const targetY =
                        topBounds.top -
                        overlapHeight *
                            (bottomGroup.length /
                                (topGroup.length + bottomGroup.length))
                    const overflowTop = Math.max(yAxis.rangeMin - targetY, 0)
                    const overflowBottom = Math.max(
                        targetY + newHeight - yAxis.rangeMax,
                        0
                    )
                    const newY = targetY + overflowTop - overflowBottom
                    const newGroup = [...topGroup, ...bottomGroup]
                    stackGroupVertically(newGroup, newY)
                    groups.splice(i, 2, newGroup)
                    hasOverlap = true
                    break
                }
            }
        } while (hasOverlap && groups.length > 1)

        for (const group of groups) {
            let currentLevel = 0
            let prevSign = 0
            for (const series of group) {
                const currentSign = Math.sign(
                    series.bounds.y - series.origBounds.y
                )
                if (prevSign === currentSign) {
                    currentLevel -= currentSign
                }
                series.level = currentLevel
                prevSign = currentSign
            }
            const minLevel = min(group.map((mark) => mark.level)) as number
            const maxLevel = max(group.map((mark) => mark.level)) as number
            for (const mark of group) {
                mark.level -= minLevel
                mark.totalLevels = maxLevel - minLevel + 1
            }
        }

        return flatten(groups)
    }

    // Overlapping placement, for when we really can't find a solution without overlaps.
    @computed get overlappingPlacement(): PlacedSeries[] {
        const series = cloneDeep(this.initialSeries)
        for (let i = 0; i < series.length; i++) {
            const m1 = series[i]

            for (let j = i + 1; j < series.length; j++) {
                const m2 = series[j]
                const isOverlap =
                    !m1.isOverlap && m1.bounds.intersects(m2.bounds)
                if (isOverlap) m2.isOverlap = true
            }
        }
        return series
    }

    @computed get placedSeries(): PlacedSeries[] {
        const nonOverlappingMinHeight =
            sumBy(this.initialSeries, (series) => series.bounds.height) +
            this.initialSeries.length * LEGEND_ITEM_MIN_SPACING
        const availableHeight = this.manager.yAxis.rangeSize
        if (nonOverlappingMinHeight > availableHeight)
            return this.overlappingPlacement
        return this.standardPlacement
    }

    @computed private get backgroundSeries(): PlacedSeries[] {
        const { focusedSeriesNames } = this.manager
        const { isFocusMode } = this
        return this.placedSeries.filter((mark) =>
            isFocusMode
                ? !focusedSeriesNames.includes(mark.seriesName)
                : mark.isOverlap
        )
    }

    @computed private get focusedSeries(): PlacedSeries[] {
        const { focusedSeriesNames } = this.manager
        const { isFocusMode } = this
        return this.placedSeries.filter((mark) =>
            isFocusMode
                ? focusedSeriesNames.includes(mark.seriesName)
                : !mark.isOverlap
        )
    }

    // Does this placement need line markers or is the position of the labels already clear?
    @computed private get needsLines(): boolean {
        return this.placedSeries.some((series) => series.totalLevels > 1)
    }

    private renderBackground(): JSX.Element[] {
        return this.backgroundSeries.map((series, index) => (
            <Label
                key={`background-${index}-` + series.seriesName}
                series={series}
                manager={this}
                needsLines={this.needsLines}
                onMouseOver={(): void => this.onMouseOver(series.seriesName)}
                onClick={(): void => this.onClick(series.seriesName)}
            />
        ))
    }

    // All labels are focused by default, moved to background when mouseover of other label
    private renderFocus(): JSX.Element[] {
        return this.focusedSeries.map((series, index) => (
            <Label
                key={`focus-${index}-` + series.seriesName}
                series={series}
                manager={this}
                isFocus={true}
                needsLines={this.needsLines}
                onMouseOver={(): void => this.onMouseOver(series.seriesName)}
                onClick={(): void => this.onClick(series.seriesName)}
                onMouseLeave={(): void => this.onMouseLeave(series.seriesName)}
            />
        ))
    }

    @computed get manager(): LineLegendManager {
        return this.props.manager
    }

    render(): JSX.Element {
        return (
            <g
                className="LineLabels"
                style={{
                    cursor: this.manager.startSelectingWhenLineClicked
                        ? "pointer"
                        : "default",
                }}
            >
                {this.renderBackground()}
                {this.renderFocus()}
            </g>
        )
    }
}
