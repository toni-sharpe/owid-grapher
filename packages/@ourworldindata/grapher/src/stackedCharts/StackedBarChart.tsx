import React from "react"
import { computed, action, observable } from "mobx"
import { observer } from "mobx-react"
import {
    Bounds,
    Time,
    uniq,
    makeSafeForCSS,
    sum,
    getRelativeMouse,
    colorScaleConfigDefaults,
    dyFromAlign,
    makeIdForHumanConsumption,
    excludeUndefined,
} from "@ourworldindata/utils"
import {
    VerticalAxisComponent,
    HorizontalAxisTickMark,
    VerticalAxisGridLines,
} from "../axis/AxisViews"
import { NoDataModal } from "../noDataModal/NoDataModal"
import {
    VerticalColorLegend,
    VerticalColorLegendManager,
    LegendItem,
} from "../verticalColorLegend/VerticalColorLegend"
import { TooltipFooterIcon } from "../tooltip/TooltipProps.js"
import {
    Tooltip,
    TooltipState,
    TooltipTable,
    makeTooltipRoundingNotice,
} from "../tooltip/Tooltip"
import {
    BASE_FONT_SIZE,
    GRAPHER_AREA_OPACITY_DEFAULT,
    GRAPHER_DARK_TEXT,
    GRAPHER_AXIS_LINE_WIDTH_DEFAULT,
    GRAPHER_AXIS_LINE_WIDTH_THICK,
    GRAPHER_FONT_SCALE_12,
} from "../core/GrapherConstants"
import { ColorScaleManager } from "../color/ColorScale"
import {
    AbstractStackedChart,
    AbstractStackedChartProps,
} from "./AbstractStackedChart"
import { StackedPoint, StackedSeries } from "./StackedConstants"
import { VerticalAxis } from "../axis/Axis"
import {
    ColorSchemeName,
    HorizontalAlign,
    VerticalAlign,
} from "@ourworldindata/types"
import { stackSeries, withMissingValuesAsZeroes } from "./StackedUtils"
import { makeClipPath } from "../chart/ChartUtils"
import { ColorScaleConfigDefaults } from "../color/ColorScaleConfig"
import { ColumnTypeMap } from "@ourworldindata/core-table"
import { HorizontalCategoricalColorLegend } from "../horizontalColorLegend/HorizontalColorLegends"
import { CategoricalBin, ColorScaleBin } from "../color/ColorScaleBin"

interface StackedBarSegmentProps extends React.SVGAttributes<SVGGElement> {
    bar: StackedPoint<Time>
    series: StackedSeries<Time>
    color: string
    opacity: number
    yAxis: VerticalAxis
    xOffset: number
    barWidth: number
    onBarMouseOver: (
        bar: StackedPoint<Time>,
        series: StackedSeries<Time>
    ) => void
    onBarMouseLeave: () => void
}

interface TickmarkPlacement {
    time: number
    text: string
    bounds: Bounds
    isHidden: boolean
}

@observer
class StackedBarSegment extends React.Component<StackedBarSegmentProps> {
    base: React.RefObject<SVGRectElement> = React.createRef()

    @observable mouseOver: boolean = false

    @computed get yPos(): number {
        const { bar, yAxis } = this.props
        return yAxis.place(bar.value + bar.valueOffset)
    }

    @computed get barHeight(): number {
        const { bar, yAxis } = this.props
        return yAxis.place(bar.valueOffset) - this.yPos
    }

    @computed get trueOpacity(): number {
        return this.mouseOver ? 1 : this.props.opacity
    }

    @action.bound onBarMouseOver(): void {
        this.mouseOver = true
        this.props.onBarMouseOver(this.props.bar, this.props.series)
    }

    @action.bound onBarMouseLeave(): void {
        this.mouseOver = false
        this.props.onBarMouseLeave()
    }

    render(): React.ReactElement {
        const { color, xOffset, barWidth } = this.props
        const { yPos, barHeight, trueOpacity } = this

        return (
            <rect
                ref={this.base}
                x={xOffset}
                y={yPos}
                width={barWidth}
                height={barHeight}
                fill={color}
                opacity={trueOpacity}
                onMouseOver={this.onBarMouseOver}
                onMouseLeave={this.onBarMouseLeave}
            />
        )
    }
}

@observer
export class StackedBarChart
    extends AbstractStackedChart
    implements VerticalColorLegendManager, ColorScaleManager
{
    readonly minBarSpacing = 4

    constructor(props: AbstractStackedChartProps) {
        super(props)
    }

    // currently hovered legend color
    @observable hoverColor?: string
    // currently hovered axis label
    @observable hoveredTick?: TickmarkPlacement
    // current hovered individual bar
    @observable tooltipState = new TooltipState<{
        bar: StackedPoint<number>
        series: StackedSeries<number>
    }>()

    @computed private get baseFontSize(): number {
        return this.manager.fontSize ?? BASE_FONT_SIZE
    }

    @computed get tickFontSize(): number {
        return GRAPHER_FONT_SCALE_12 * this.baseFontSize
    }

    @computed get barWidth(): number {
        const { dualAxis } = this

        return (0.8 * dualAxis.innerBounds.width) / this.xValues.length
    }

    @computed get barSpacing(): number {
        return (
            this.dualAxis.innerBounds.width / this.xValues.length -
            this.barWidth
        )
    }

    @computed private get showHorizontalLegend(): boolean {
        return !!(this.manager.isSemiNarrow || this.manager.isStaticAndSmall)
    }

    @computed get legendAlign(): HorizontalAlign {
        return HorizontalAlign.left
    }

    @computed protected get paddingForLegendRight(): number {
        return this.showHorizontalLegend ? 0 : this.sidebarWidth + 20
    }

    @computed protected get paddingForLegendTop(): number {
        return this.showHorizontalLegend
            ? this.horizontalColorLegend.height + 8
            : 0
    }

    @computed get shouldRunLinearInterpolation(): boolean {
        // disabled by default
        return this.props.enableLinearInterpolation ?? false
    }

    // All currently hovered group keys, combining the legend and the main UI
    @computed get hoverKeys(): string[] {
        const { hoverColor, manager } = this
        const { externalLegendFocusBin } = manager

        const hoverKeys =
            hoverColor === undefined
                ? []
                : uniq(
                      this.series
                          .filter((g) => g.color === hoverColor)
                          .map((g) => g.seriesName)
                  )
        if (externalLegendFocusBin) {
            hoverKeys.push(
                ...this.rawSeries
                    .map((g) => g.seriesName)
                    .filter((name) => externalLegendFocusBin.contains(name))
            )
        }

        return hoverKeys
    }

    @computed get activeColors(): string[] {
        const { hoverKeys } = this
        const activeKeys = hoverKeys.length > 0 ? hoverKeys : []

        if (!activeKeys.length)
            // No hover means they're all active by default
            return uniq(this.series.map((g) => g.color))

        return uniq(
            this.series
                .filter((g) => activeKeys.indexOf(g.seriesName) !== -1)
                .map((g) => g.color)
        )
    }

    // used by <VerticalColorLegend />
    @computed get legendItems(): (LegendItem &
        Required<Pick<LegendItem, "label">>)[] {
        return this.series
            .map((series) => {
                return {
                    label: series.seriesName,
                    color: series.color,
                }
            })
            .reverse() // Vertical legend orders things in the opposite direction we want
    }

    // used by <HorizontalCategoricalColorLegend />
    @computed get categoricalLegendData(): CategoricalBin[] {
        return this.legendItems.map(
            (legendItem, index) =>
                new CategoricalBin({
                    index,
                    value: legendItem.label,
                    label: legendItem.label,
                    color: legendItem.color,
                })
        )
    }

    @computed get legendWidth(): number {
        return this.showHorizontalLegend
            ? this.bounds.width
            : this.verticalColorLegend.width
    }

    @computed get maxLegendWidth(): number {
        return this.showHorizontalLegend
            ? this.bounds.width
            : this.sidebarMaxWidth
    }

    @computed get sidebarMaxWidth(): number {
        return this.bounds.width / 5
    }

    @computed get sidebarMinWidth(): number {
        return 100
    }

    @computed get sidebarWidth(): number {
        if (!this.manager.showLegend) return 0
        const {
            sidebarMinWidth,
            sidebarMaxWidth,
            verticalColorLegend: legendDimensions,
        } = this
        return Math.max(
            Math.min(legendDimensions.width, sidebarMaxWidth),
            sidebarMinWidth
        )
    }

    @computed private get verticalColorLegend(): VerticalColorLegend {
        return new VerticalColorLegend({ manager: this })
    }

    @computed
    private get horizontalColorLegend(): HorizontalCategoricalColorLegend {
        return new HorizontalCategoricalColorLegend({ manager: this })
    }

    @computed get tooltip(): React.ReactElement | undefined {
        const {
            tooltipState: { target, position, fading },
            yColumns,
            series,
            hoveredTick,
        } = this

        const { bar: hoverBar, series: hoverSeries } = target ?? {}
        let hoverTime: number
        if (hoverBar !== undefined) {
            hoverTime = hoverBar.position
        } else if (hoveredTick !== undefined) {
            hoverTime = hoveredTick.time
        } else return

        const formatColumn = yColumns[0], // we can just use the first column for formatting, b/c we assume all columns have same type
            { unit, shortUnit } = formatColumn

        const totalValue = sum(
            series.map(
                ({ points }) =>
                    points.find((bar) => bar.position === hoverTime)?.value ?? 0
            )
        )

        const roundingNotice = formatColumn.roundsToSignificantFigures
            ? {
                  icon: TooltipFooterIcon.none,
                  text: makeTooltipRoundingNotice([
                      formatColumn.numSignificantFigures,
                  ]),
              }
            : undefined
        const footer = excludeUndefined([roundingNotice])

        return (
            <Tooltip
                id={this.renderUid}
                tooltipManager={this.props.manager}
                x={position.x}
                y={position.y}
                style={{ maxWidth: "500px" }}
                offsetX={20}
                offsetY={-16}
                title={formatColumn.formatTime(hoverTime)}
                subtitle={unit !== shortUnit ? unit : undefined}
                subtitleFormat="unit"
                footer={footer}
                dissolve={fading}
            >
                <TooltipTable
                    columns={[formatColumn]}
                    totals={[totalValue]}
                    rows={series
                        .slice()
                        .reverse()
                        .map((series) => {
                            const {
                                seriesName: name,
                                color: swatch,
                                points,
                            } = series
                            const point = points.find(
                                (bar) => bar.position === hoverTime
                            )
                            const focused = hoverSeries?.seriesName === name
                            const blurred = point?.fake ?? true
                            const values = [
                                point?.fake ? undefined : point?.value,
                            ]

                            return {
                                name,
                                swatch,
                                blurred,
                                focused,
                                values,
                            }
                        })}
                />
            </Tooltip>
        )
    }

    @computed get mapXValueToOffset(): Map<number, number> {
        const { dualAxis, barWidth, barSpacing } = this

        const xValueToOffset = new Map<number, number>()
        let xOffset = dualAxis.innerBounds.left + barSpacing

        for (const xValue of this.xValues) {
            xValueToOffset.set(xValue, xOffset)
            xOffset += barWidth + barSpacing
        }
        return xValueToOffset
    }

    // Place ticks centered beneath the bars, before doing overlap detection
    @computed private get tickPlacements(): TickmarkPlacement[] {
        const { mapXValueToOffset, barWidth, dualAxis } = this
        const { xValues } = this
        const { horizontalAxis } = dualAxis

        return xValues.map((x) => {
            const text = horizontalAxis.formatTick(x)
            const xPos = mapXValueToOffset.get(x) as number

            const bounds = Bounds.forText(text, { fontSize: this.tickFontSize })
            return {
                time: x,
                text,
                bounds: bounds.set({
                    x: xPos + barWidth / 2 - bounds.width / 2,
                    y: dualAxis.innerBounds.bottom + 5,
                }),
                isHidden: false,
            }
        })
    }

    @computed get ticks(): TickmarkPlacement[] {
        const { tickPlacements } = this

        for (let i = 0; i < tickPlacements.length; i++) {
            for (let j = 1; j < tickPlacements.length; j++) {
                const t1 = tickPlacements[i],
                    t2 = tickPlacements[j]

                if (t1 === t2 || t1.isHidden || t2.isHidden) continue

                if (t1.bounds.intersects(t2.bounds.padWidth(-5))) {
                    if (i === 0) t2.isHidden = true
                    else if (j === tickPlacements.length - 1) t1.isHidden = true
                    else t2.isHidden = true
                }
            }
        }

        return tickPlacements.filter((t) => !t.isHidden)
    }

    // Both legend managers accept a `onLegendMouseOver` property, but define different signatures.
    // The <HorizontalCategoricalColorLegend /> component expects a string,
    // the <VerticalColorLegend /> component expects a ColorScaleBin.
    @action.bound onLegendMouseOver(binOrColor: string | ColorScaleBin): void {
        this.hoverColor =
            typeof binOrColor === "string" ? binOrColor : binOrColor.color
    }

    @action.bound onLegendMouseLeave(): void {
        this.hoverColor = undefined
    }

    @action.bound onLabelMouseOver(tick: TickmarkPlacement): void {
        this.hoveredTick = tick
    }

    @action.bound onLabelMouseLeave(): void {
        this.hoveredTick = undefined
    }

    @action.bound onBarMouseOver(
        bar: StackedPoint<Time>,
        series: StackedSeries<Time>
    ): void {
        this.tooltipState.target = { bar, series }
    }

    @action.bound private onMouseMove(ev: React.MouseEvent): void {
        const ref = this.manager.base?.current
        if (ref) {
            this.tooltipState.position = getRelativeMouse(ref, ev)
        }
    }

    @action.bound onBarMouseLeave(): void {
        this.tooltipState.target = null
    }

    render(): React.ReactElement {
        if (this.failMessage)
            return (
                <NoDataModal
                    manager={this.manager}
                    bounds={this.bounds}
                    message={this.failMessage}
                />
            )

        const {
            manager,
            dualAxis,
            renderUid,
            bounds,
            tooltip,
            barWidth,
            mapXValueToOffset,
            ticks,
            tooltipState: { target },
        } = this
        const { series } = this
        const { innerBounds, verticalAxis } = dualAxis

        const clipPath = makeClipPath(renderUid, innerBounds)

        const axisLineWidth = manager.isStaticAndSmall
            ? GRAPHER_AXIS_LINE_WIDTH_THICK
            : GRAPHER_AXIS_LINE_WIDTH_DEFAULT

        const legend = this.showHorizontalLegend ? (
            <HorizontalCategoricalColorLegend manager={this} />
        ) : (
            <VerticalColorLegend manager={this} />
        )

        return (
            <g
                className="StackedBarChart"
                width={bounds.width}
                height={bounds.height}
                onMouseMove={this.onMouseMove}
            >
                {clipPath.element}

                <rect
                    x={bounds.left}
                    y={bounds.top}
                    width={bounds.width}
                    height={bounds.height}
                    opacity={0}
                    fill="rgba(255,255,255,0)"
                />
                {!verticalAxis.hideAxis && (
                    <VerticalAxisComponent
                        bounds={bounds}
                        verticalAxis={verticalAxis}
                        labelColor={manager.secondaryColorInStaticCharts}
                        detailsMarker={manager.detailsMarkerInSvg}
                    />
                )}
                <VerticalAxisGridLines
                    verticalAxis={verticalAxis}
                    bounds={innerBounds}
                    strokeWidth={axisLineWidth}
                />

                <g id={makeIdForHumanConsumption("tick-marks")}>
                    {ticks.map((tick, i) => (
                        <HorizontalAxisTickMark
                            key={i}
                            id={makeIdForHumanConsumption(
                                "tick-mark",
                                tick.text
                            )}
                            tickMarkTopPosition={innerBounds.bottom}
                            tickMarkXPosition={tick.bounds.centerX}
                            color="#666"
                            width={axisLineWidth}
                        />
                    ))}
                </g>

                <g id={makeIdForHumanConsumption("tick-labels")}>
                    {ticks.map((tick, i) => {
                        return (
                            <text
                                key={i}
                                id={makeIdForHumanConsumption(
                                    "tick__label",
                                    tick.text
                                )}
                                x={tick.bounds.x}
                                y={tick.bounds.y + 1}
                                fill={GRAPHER_DARK_TEXT}
                                fontSize={this.tickFontSize}
                                onMouseOver={(): void => {
                                    this.onLabelMouseOver(tick)
                                }}
                                onMouseLeave={this.onLabelMouseLeave}
                                dy={dyFromAlign(VerticalAlign.bottom)}
                            >
                                {tick.text}
                            </text>
                        )
                    })}
                </g>

                <g clipPath={clipPath.id}>
                    {series.map((series, index) => {
                        const isLegendHovered = this.hoverKeys.includes(
                            series.seriesName
                        )
                        const opacity =
                            isLegendHovered || this.hoverKeys.length === 0
                                ? GRAPHER_AREA_OPACITY_DEFAULT
                                : 0.2

                        return (
                            <g
                                key={index}
                                className={
                                    makeSafeForCSS(series.seriesName) +
                                    "-segments"
                                }
                            >
                                {series.points.map((bar, index) => {
                                    const xPos = mapXValueToOffset.get(
                                        bar.position
                                    ) as number
                                    const barOpacity =
                                        bar === target?.bar ? 1 : opacity

                                    return (
                                        <StackedBarSegment
                                            key={index}
                                            bar={bar}
                                            color={series.color}
                                            xOffset={xPos}
                                            opacity={barOpacity}
                                            yAxis={verticalAxis}
                                            series={series}
                                            onBarMouseOver={this.onBarMouseOver}
                                            onBarMouseLeave={
                                                this.onBarMouseLeave
                                            }
                                            barWidth={barWidth}
                                        />
                                    )
                                })}
                            </g>
                        )
                    })}
                </g>

                {this.manager.showLegend && legend}
                {tooltip}
            </g>
        )
    }

    @computed get categoryLegendY(): number {
        return this.bounds.top
    }

    @computed get legendY(): number {
        return this.bounds.top
    }

    @computed get legendX(): number {
        return this.showHorizontalLegend
            ? this.bounds.left
            : this.bounds.right - this.sidebarWidth
    }

    @computed private get xValues(): number[] {
        return uniq(this.allStackedPoints.map((bar) => bar.position))
    }

    @computed get colorScaleConfig(): ColorScaleConfigDefaults | undefined {
        return {
            ...colorScaleConfigDefaults,
            ...this.manager.colorScale,
        }
    }

    defaultBaseColorScheme = ColorSchemeName.stackedAreaDefault

    @computed get series(): readonly StackedSeries<number>[] {
        // TODO: remove once monthly data is supported (https://github.com/owid/owid-grapher/issues/2007)
        const enforceUniformSpacing = !(
            this.transformedTable.timeColumn instanceof ColumnTypeMap.Day
        )

        return stackSeries(
            withMissingValuesAsZeroes(this.unstackedSeries, {
                enforceUniformSpacing,
            })
        )
    }
}
