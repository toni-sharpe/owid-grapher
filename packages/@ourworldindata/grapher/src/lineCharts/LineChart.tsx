import React from "react"
import {
    sortBy,
    groupBy,
    mapValues,
    sum,
    guid,
    excludeNullish,
    values,
    getRelativeMouse,
    pointsToPath,
    minBy,
    flatten,
    last,
    exposeInstanceOnWindow,
    round,
    excludeUndefined,
    isNumber,
    sortedUniqBy,
    isMobile,
    Bounds,
    DEFAULT_BOUNDS,
    PointVector,
    AxisAlign,
    Color,
    HorizontalAlign,
    PrimitiveType,
} from "@ourworldindata/utils"
import { computed, action, observable } from "mobx"
import { observer } from "mobx-react"
import { select } from "d3-selection"
import { easeLinear } from "d3-ease"
import { DualAxisComponent } from "../axis/AxisViews"
import { DualAxis, HorizontalAxis, VerticalAxis } from "../axis/Axis"
import {
    LineLegend,
    LineLabelSeries,
    LineLegendManager,
} from "../lineLegend/LineLegend"
import { ComparisonLine } from "../scatterCharts/ComparisonLine"
import { Tooltip, TooltipState, TooltipTable } from "../tooltip/Tooltip"
import { NoDataModal } from "../noDataModal/NoDataModal"
import { extent } from "d3-array"
import {
    SeriesName,
    ScaleType,
    EntityName,
    SeriesStrategy,
    FacetStrategy,
    CoreValueType,
    MissingDataStrategy,
    ColorScaleConfigInterface,
    ColorSchemeName,
} from "@ourworldindata/types"
import {
    GRAPHER_AXIS_LINE_WIDTH_THICK,
    GRAPHER_AXIS_LINE_WIDTH_DEFAULT,
    BASE_FONT_SIZE,
} from "../core/GrapherConstants"
import { ColorSchemes } from "../color/ColorSchemes"
import { AxisConfig, AxisManager } from "../axis/AxisConfig"
import { ChartInterface } from "../chart/ChartInterface"
import {
    LinesProps,
    LineChartSeries,
    LineChartManager,
    LinePoint,
    PlacedLineChartSeries,
    PlacedPoint,
} from "./LineChartConstants"
import {
    OwidTable,
    CoreColumn,
    isNotErrorValue,
    BlankOwidTable,
} from "@ourworldindata/core-table"
import {
    autoDetectSeriesStrategy,
    autoDetectYColumnSlugs,
    getDefaultFailMessage,
    getSeriesKey,
    makeClipPath,
    makeSelectionArray,
} from "../chart/ChartUtils"
import { ColorScheme } from "../color/ColorScheme"
import { SelectionArray } from "../selection/SelectionArray"
import { CategoricalBin, ColorScaleBin } from "../color/ColorScaleBin"
import { ColorScale, ColorScaleManager } from "../color/ColorScale"
import { ColorScaleConfig } from "../color/ColorScaleConfig"
import { OwidNoDataGray } from "../color/ColorConstants"
import { MultiColorPolyline } from "../scatterCharts/MultiColorPolyline"
import { CategoricalColorAssigner } from "../color/CategoricalColorAssigner"
import { darkenColorForLine } from "../color/ColorUtils"
import {
    HorizontalColorLegendManager,
    HorizontalNumericColorLegend,
} from "../horizontalColorLegend/HorizontalColorLegends"

// background
const BACKGROUND_COLOR = "#fff"
// line color
const BLUR_LINE_COLOR = "#eee"
const DEFAULT_LINE_COLOR = "#000"
// stroke width
const DEFAULT_STROKE_WIDTH = 1.5
const VARIABLE_COLOR_STROKE_WIDTH = 2.5
// marker radius
const DEFAULT_MARKER_RADIUS = 1.8
const VARIABLE_COLOR_MARKER_RADIUS = 2.2
// line outline
const DEFAULT_LINE_OUTLINE_WIDTH = 0.5
const VARIABLE_COLOR_LINE_OUTLINE_WIDTH = 1.0
// legend
const LEGEND_PADDING = 25

@observer
class Lines extends React.Component<LinesProps> {
    @computed get bounds(): Bounds {
        const { horizontalAxis, verticalAxis } = this.props.dualAxis
        return Bounds.fromCorners(
            new PointVector(horizontalAxis.range[0], verticalAxis.range[0]),
            new PointVector(horizontalAxis.range[1], verticalAxis.range[1])
        )
    }

    @computed private get focusedLines(): PlacedLineChartSeries[] {
        const { focusedSeriesNames } = this.props
        // If nothing is focused, everything is
        if (!focusedSeriesNames.length) return this.props.placedSeries
        return this.props.placedSeries.filter((series) =>
            focusedSeriesNames.includes(series.seriesName)
        )
    }

    @computed private get backgroundLines(): PlacedLineChartSeries[] {
        const { focusedSeriesNames } = this.props
        return this.props.placedSeries.filter(
            (series) => !focusedSeriesNames.includes(series.seriesName)
        )
    }

    // Don't display point markers if there are very many of them for performance reasons
    // Note that we're using circle elements instead of marker-mid because marker performance in Safari 10 is very poor for some reason
    @computed private get hasMarkers(): boolean {
        if (this.props.hidePoints) return false
        return (
            sum(this.focusedLines.map((series) => series.placedPoints.length)) <
            500
        )
    }

    @computed private get markerRadius(): number {
        return this.props.markerRadius ?? DEFAULT_MARKER_RADIUS
    }

    @computed private get strokeWidth(): number {
        return this.props.lineStrokeWidth ?? DEFAULT_STROKE_WIDTH
    }

    @computed private get lineOutlineWidth(): number {
        return this.props.lineOutlineWidth ?? DEFAULT_LINE_OUTLINE_WIDTH
    }

    private renderFocusGroups(): JSX.Element[] {
        return this.focusedLines.map((series, index) => {
            // If the series only contains one point, then we will always want to show a marker/circle
            // because we can't draw a line.
            const showMarkers =
                (this.hasMarkers || series.placedPoints.length === 1) &&
                !series.isProjection
            const strokeDasharray = series.isProjection ? "2,3" : undefined

            return (
                <g key={index}>
                    {/*
                        Create a white outline around the lines so they're
                        easier to follow when they overlap.
                    */}
                    <path
                        fill="none"
                        strokeLinecap="butt"
                        strokeLinejoin="round"
                        stroke={BACKGROUND_COLOR}
                        strokeWidth={
                            this.strokeWidth + this.lineOutlineWidth * 2
                        }
                        strokeDasharray={strokeDasharray}
                        d={pointsToPath(
                            series.placedPoints.map((value) => [
                                value.x,
                                value.y,
                            ]) as [number, number][]
                        )}
                    />
                    <MultiColorPolyline
                        points={series.placedPoints}
                        strokeLinejoin="round"
                        strokeWidth={this.strokeWidth}
                        strokeDasharray={strokeDasharray}
                    />
                    {showMarkers && (
                        <g>
                            {series.placedPoints.map((value, index) => (
                                <circle
                                    key={index}
                                    cx={value.x}
                                    cy={value.y}
                                    r={this.markerRadius}
                                    fill={value.color}
                                />
                            ))}
                        </g>
                    )}
                </g>
            )
        })
    }

    private renderBackgroundGroups(): JSX.Element[] {
        return this.backgroundLines.map((series, index) => (
            <g key={index}>
                <path
                    key={getSeriesKey(series, "line")}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    stroke="#ddd"
                    d={pointsToPath(
                        series.placedPoints.map((value) => [
                            value.x,
                            value.y,
                        ]) as [number, number][]
                    )}
                    fill="none"
                    strokeWidth={1}
                />
            </g>
        ))
    }

    render(): JSX.Element {
        const { bounds } = this

        return (
            <g className="Lines">
                <rect
                    x={Math.round(bounds.x)}
                    y={Math.round(bounds.y)}
                    width={Math.round(bounds.width)}
                    height={Math.round(bounds.height)}
                    fill="rgba(255,255,255,0)"
                    opacity={0}
                />
                {this.renderBackgroundGroups()}
                {this.renderFocusGroups()}
            </g>
        )
    }
}

@observer
export class LineChart
    extends React.Component<{
        bounds?: Bounds
        manager: LineChartManager
    }>
    implements
        ChartInterface,
        LineLegendManager,
        AxisManager,
        ColorScaleManager,
        HorizontalColorLegendManager
{
    base: React.RefObject<SVGGElement> = React.createRef()

    transformTable(table: OwidTable): OwidTable {
        table = table.filterByEntityNames(
            this.selectionArray.selectedEntityNames
        )

        // TODO: remove this filter once we don't have mixed type columns in datasets
        // Currently we set skipParsing=true on these columns to be backwards-compatible
        table = table.replaceNonNumericCellsWithErrorValues(this.yColumnSlugs)

        if (this.isLogScale)
            table = table.replaceNonPositiveCellsForLogScale(this.yColumnSlugs)

        if (this.colorColumnSlug) {
            table = table
                // TODO: remove this filter once we don't have mixed type columns in datasets
                // Currently we set skipParsing=true on these columns to be backwards-compatible
                .replaceNonNumericCellsWithErrorValues([this.colorColumnSlug])
                .interpolateColumnWithTolerance(this.colorColumnSlug)
        }

        // drop all data when the author chose to hide entities with missing data and
        // at least one of the variables has no data for the current entity
        if (
            this.missingDataStrategy === MissingDataStrategy.hide &&
            table.hasAnyColumnNoValidValue(this.yColumnSlugs)
        ) {
            table = table.dropAllRows()
        }

        return table
    }

    transformTableForSelection(table: OwidTable): OwidTable {
        // if entities with partial data are not plotted,
        // make sure they don't show up in the entity selector
        if (this.missingDataStrategy === MissingDataStrategy.hide) {
            table = table.replaceNonNumericCellsWithErrorValues(
                this.yColumnSlugs
            )

            const groupedByEntity = table
                .groupBy(table.entityNameColumn.slug)
                .filter((t) => !t.hasAnyColumnNoValidValue(this.yColumnSlugs))

            if (groupedByEntity.length === 0) return BlankOwidTable()

            table = groupedByEntity[0].concat(groupedByEntity.slice(1))
        }

        return table
    }

    @computed private get missingDataStrategy(): MissingDataStrategy {
        return this.manager.missingDataStrategy || MissingDataStrategy.auto
    }

    @computed get inputTable(): OwidTable {
        return this.manager.table
    }

    @computed private get transformedTableFromGrapher(): OwidTable {
        return (
            this.manager.transformedTable ??
            this.transformTable(this.inputTable)
        )
    }

    @computed get transformedTable(): OwidTable {
        let table = this.transformedTableFromGrapher
        // The % growth transform cannot be applied in transformTable() because it will filter out
        // any rows before startHandleTimeBound and change the timeline bounds.
        const { isRelativeMode, startHandleTimeBound } = this.manager
        if (isRelativeMode && startHandleTimeBound !== undefined) {
            table = table.toTotalGrowthForEachColumnComparedToStartTime(
                startHandleTimeBound,
                this.manager.yColumnSlugs ?? []
            )
        }
        return table
    }

    @action.bound private onCursorLeave(): void {
        this.tooltipState.target = null
        this.clearHighlightedSeries()
    }

    @computed private get allValues(): LinePoint[] {
        return flatten(this.placedSeries.map((series) => series.points))
    }

    @observable tooltipState = new TooltipState<{
        x: number
    }>({ fade: "immediate" })

    @action.bound private onCursorMove(
        ev: React.MouseEvent | React.TouchEvent
    ): void {
        const ref = this.base.current,
            parentRef = this.manager.base?.current

        // the tooltip's origin needs to be in the parent's coordinates
        if (parentRef) {
            this.tooltipState.position = getRelativeMouse(parentRef, ev)
        }

        if (!ref) return

        const mouse = getRelativeMouse(ref, ev)

        const boxPadding = isMobile() ? 44 : 25

        // expand the box width, so it's easier to see the tooltip for the first & last timepoints
        const boundedBox = this.dualAxis.innerBounds.expand({
            left: boxPadding,
            right: boxPadding,
        })

        let hoverX
        if (boundedBox.contains(mouse)) {
            const invertedX = this.dualAxis.horizontalAxis.invert(mouse.x)

            const closestValue = minBy(this.allValues, (point) =>
                Math.abs(invertedX - point.x)
            )
            hoverX = closestValue?.x
        }

        // be sure all lines are un-dimmed if the cursor is above the graph itself
        if (this.dualAxis.innerBounds.contains(mouse)) {
            this.hoveredSeriesName = undefined
        }

        this.tooltipState.target = hoverX === undefined ? null : { x: hoverX }
    }

    @computed private get manager(): LineChartManager {
        return this.props.manager
    }

    @computed get bounds(): Bounds {
        return this.props.bounds ?? DEFAULT_BOUNDS
    }

    @computed private get boundsWithoutColorLegend(): Bounds {
        return this.bounds.padTop(
            this.hasColorLegend ? this.legendHeight + LEGEND_PADDING : 0
        )
    }

    @computed get maxLineLegendWidth(): number {
        return this.bounds.width / 3
    }

    @computed private get lineStrokeWidth(): number {
        if (this.manager.lineStrokeWidth) return this.manager.lineStrokeWidth
        const factor = this.manager.isStaticAndSmall ? 2 : 1
        return this.hasColorScale
            ? factor * VARIABLE_COLOR_STROKE_WIDTH
            : factor * DEFAULT_STROKE_WIDTH
    }

    @computed private get lineOutlineWidth(): number {
        return this.hasColorScale
            ? VARIABLE_COLOR_LINE_OUTLINE_WIDTH
            : DEFAULT_LINE_OUTLINE_WIDTH
    }

    @computed private get markerRadius(): number {
        // hide markers but don't remove them from the DOM
        if (this.manager.isStaticAndSmall) return 0
        return this.hasColorScale
            ? VARIABLE_COLOR_MARKER_RADIUS
            : DEFAULT_MARKER_RADIUS
    }

    @computed get selectionArray(): SelectionArray {
        return makeSelectionArray(this.manager.selection)
    }

    seriesIsBlurred(series: LineChartSeries): boolean {
        return (
            this.isFocusMode &&
            !this.focusedSeriesNames.includes(series.seriesName)
        )
    }

    @computed get activeX(): number | undefined {
        return (
            this.tooltipState.target?.x ?? this.props.manager.annotation?.year
        )
    }

    @computed get activeXVerticalLine(): JSX.Element | undefined {
        const { activeX, dualAxis } = this
        const { horizontalAxis, verticalAxis } = dualAxis

        if (activeX === undefined) return undefined

        return (
            <g className="hoverIndicator">
                <line
                    x1={horizontalAxis.place(activeX)}
                    y1={verticalAxis.range[0]}
                    x2={horizontalAxis.place(activeX)}
                    y2={verticalAxis.range[1]}
                    stroke="rgba(180,180,180,.4)"
                />
                {this.series.map((series) => {
                    const value = series.points.find(
                        (point) => point.x === activeX
                    )
                    if (!value || this.seriesIsBlurred(series)) return null

                    return (
                        <circle
                            key={getSeriesKey(series)}
                            cx={horizontalAxis.place(value.x)}
                            cy={verticalAxis.place(value.y)}
                            r={this.lineStrokeWidth / 2 + 3.5}
                            fill={
                                this.hasColorScale
                                    ? darkenColorForLine(
                                          this.getColorScaleColor(
                                              value.colorValue
                                          )
                                      )
                                    : series.color
                            }
                            stroke="#fff"
                            strokeWidth={0.5}
                        />
                    )
                })}
            </g>
        )
    }

    @computed private get tooltip(): JSX.Element | undefined {
        const { formatColumn, colorColumn, hasColorScale } = this
        const { target, position, fading } = this.tooltipState

        if (!target) return undefined

        // Duplicate seriesNames will be present if there is a projected-values line
        const seriesSegments = mapValues(
            groupBy(this.series, "seriesName"),
            (segments) =>
                segments.find((series) =>
                    // Ideally pick series with a defined value at the target time
                    series.points.find((point) => point.x === target.x)
                ) ??
                segments.find((series): boolean | void => {
                    // Otherwise pick the series whose start & end contains the target time
                    // and display a "No data" notice.
                    const [startX, endX] = extent(series.points, ({ x }) => x)
                    return (
                        isNumber(startX) &&
                        isNumber(endX) &&
                        startX < target.x &&
                        target.x < endX
                    )
                }) ??
                null // If neither series matches, exclude the entity from the tooltip altogether
        )

        const sortedData = sortBy(
            excludeNullish(values(seriesSegments)),
            (series) => {
                const value = series.points.find(
                    (point) => point.x === target.x
                )
                return value !== undefined ? -value.y : Infinity
            }
        )

        const formattedTime = formatColumn.formatTime(target.x),
            { unit, shortUnit } = formatColumn,
            { isRelativeMode, startTime } = this.manager

        const columns = [formatColumn]
        if (hasColorScale) columns.push(colorColumn)

        const unitLabel = unit !== shortUnit ? unit : undefined
        const subtitle =
            isRelativeMode && startTime
                ? `% change since ${formatColumn.formatTime(startTime)}`
                : unitLabel
        const subtitleFormat = subtitle === unitLabel ? "unit" : undefined
        const footer = sortedData.some((series) => series.isProjection)
            ? `Projected data`
            : undefined

        return (
            <Tooltip
                id={this.renderUid}
                tooltipManager={this.manager}
                x={position.x}
                y={position.y}
                style={{ maxWidth: "400px" }}
                offsetXDirection="left"
                offsetX={20}
                offsetY={-16}
                title={formattedTime}
                subtitle={subtitle}
                subtitleFormat={subtitleFormat}
                footer={footer}
                footerFormat="stripes"
                dissolve={fading}
            >
                <TooltipTable
                    columns={columns}
                    rows={sortedData.map((series) => {
                        const { seriesName: name, isProjection: striped } =
                            series
                        const annotation = this.getAnnotationsForSeries(name)

                        const point = series.points.find(
                            (point) => point.x === target.x
                        )

                        const blurred =
                            this.seriesIsBlurred(series) || point === undefined

                        const swatch = blurred
                            ? BLUR_LINE_COLOR
                            : this.hasColorScale
                            ? darkenColorForLine(
                                  this.getColorScaleColor(point?.colorValue)
                              )
                            : series.color

                        const values = [
                            point?.y,
                            point?.colorValue as undefined | number,
                        ]

                        return {
                            name,
                            annotation,
                            swatch,
                            blurred,
                            striped,
                            values,
                        }
                    })}
                />
            </Tooltip>
        )
    }

    defaultRightPadding = 1

    @observable hoveredSeriesName?: SeriesName
    @action.bound onLineLegendClick(): void {
        if (this.manager.startSelectingWhenLineClicked)
            this.manager.isSelectingData = true
    }

    @observable private hoverTimer?: NodeJS.Timeout

    @action.bound onLineLegendMouseOver(seriesName: SeriesName): void {
        clearTimeout(this.hoverTimer)
        this.hoveredSeriesName = seriesName
    }

    @action.bound clearHighlightedSeries(): void {
        clearTimeout(this.hoverTimer)
        this.hoverTimer = setTimeout(() => {
            // wait before clearing selection in case the mouse is moving quickly over neighboring labels
            this.hoveredSeriesName = undefined
        }, 200)
    }

    @action.bound onLineLegendMouseLeave(): void {
        this.clearHighlightedSeries()
    }

    @computed get focusedSeriesNames(): string[] {
        const { externalLegendFocusBin } = this.manager
        const focusedSeriesNames = excludeUndefined([
            this.props.manager.annotation?.entityName,
            this.hoveredSeriesName,
        ])
        if (externalLegendFocusBin) {
            focusedSeriesNames.push(
                ...this.series
                    .map((s) => s.seriesName)
                    .filter((name) => externalLegendFocusBin.contains(name))
            )
        }
        return focusedSeriesNames
    }

    @computed get isFocusMode(): boolean {
        return this.focusedSeriesNames.length > 0
    }

    animSelection?: d3.Selection<
        d3.BaseType,
        unknown,
        SVGGElement | null,
        unknown
    >
    componentDidMount(): void {
        if (!this.manager.disableIntroAnimation) {
            this.runFancyIntroAnimation()
        }
        exposeInstanceOnWindow(this)
    }

    componentWillUnmount(): void {
        if (this.animSelection) this.animSelection.interrupt()
    }

    @computed get renderUid(): number {
        return guid()
    }

    @computed get detailsOrderedByReference(): string[] {
        return this.manager.detailsOrderedByReference ?? []
    }

    @computed get fontSize(): number {
        return this.manager.fontSize ?? BASE_FONT_SIZE
    }

    @computed get fontWeight(): number {
        return this.hasColorScale ? 700 : 400
    }

    @computed get lineLegendX(): number {
        return this.bounds.right - (this.lineLegendDimensions?.width || 0)
    }

    @computed get clipPathBounds(): Bounds {
        const { dualAxis, boundsWithoutColorLegend } = this
        return boundsWithoutColorLegend
            .set({ x: dualAxis.innerBounds.x })
            .expand(10)
    }

    @computed get clipPath(): { id: string; element: JSX.Element } {
        return makeClipPath(this.renderUid, this.clipPathBounds)
    }

    private runFancyIntroAnimation(): void {
        this.animSelection = select(this.base.current)
            .selectAll("clipPath > rect")
            .attr("width", 0)
        this.animSelection
            .transition()
            .duration(800)
            .ease(easeLinear)
            .attr("width", this.clipPathBounds.width)
            .on("end", () => this.forceUpdate()) // Important in case bounds changes during transition
    }

    @computed private get lineLegendDimensions(): LineLegend | undefined {
        return this.manager.hideLegend
            ? undefined
            : new LineLegend({ manager: this })
    }

    @computed get availableFacetStrategies(): FacetStrategy[] {
        const strategies: FacetStrategy[] = [FacetStrategy.none]

        if (this.selectionArray.numSelectedEntities > 1)
            strategies.push(FacetStrategy.entity)

        const numNonProjectionColumns = this.yColumns.filter(
            (c) => !c.display?.isProjection
        ).length
        if (numNonProjectionColumns > 1) strategies.push(FacetStrategy.metric)

        return strategies
    }

    render(): JSX.Element {
        if (this.failMessage)
            return (
                <NoDataModal
                    manager={this.manager}
                    bounds={this.bounds}
                    message={this.failMessage}
                />
            )

        const { manager, tooltip, dualAxis, clipPath, activeXVerticalLine } =
            this

        const comparisonLines = manager.comparisonLines || []

        const showLegend = !manager.hideLegend

        // The tiny bit of extra space in the clippath is to ensure circles centered on the very edge are still fully visible
        return (
            <g
                ref={this.base}
                className="LineChart"
                onMouseLeave={this.onCursorLeave}
                onTouchEnd={this.onCursorLeave}
                onTouchCancel={this.onCursorLeave}
                onMouseMove={this.onCursorMove}
                onTouchStart={this.onCursorMove}
                onTouchMove={this.onCursorMove}
            >
                {clipPath.element}
                <rect {...this.bounds.toProps()} fill="none">
                    {/* This <rect> ensures that the parent <g> is big enough such that we get mouse hover events for the
                    whole charting area, including the axis, the entity labels, and the whitespace next to them.
                    We need these to be able to show the tooltip for the first/last year even if the mouse is outside the charting area. */}
                </rect>
                {this.hasColorLegend && (
                    <HorizontalNumericColorLegend manager={this} />
                )}
                <DualAxisComponent
                    dualAxis={dualAxis}
                    showTickMarks={true}
                    labelColor={manager.secondaryColorInStaticCharts}
                    lineWidth={
                        manager.isStaticAndSmall
                            ? GRAPHER_AXIS_LINE_WIDTH_THICK
                            : GRAPHER_AXIS_LINE_WIDTH_DEFAULT
                    }
                    dodMarker={manager.detailsMarkerInSvg}
                />
                <g clipPath={clipPath.id}>
                    {comparisonLines.map((line, index) => (
                        <ComparisonLine
                            key={index}
                            dualAxis={dualAxis}
                            comparisonLine={line}
                        />
                    ))}
                    {showLegend && <LineLegend manager={this} />}
                    <Lines
                        dualAxis={dualAxis}
                        placedSeries={this.placedSeries}
                        hidePoints={manager.hidePoints}
                        focusedSeriesNames={this.focusedSeriesNames}
                        lineStrokeWidth={this.lineStrokeWidth}
                        lineOutlineWidth={this.lineOutlineWidth}
                        markerRadius={this.markerRadius}
                    />
                </g>
                {activeXVerticalLine}

                {tooltip}
            </g>
        )
    }

    @computed get failMessage(): string {
        const message = getDefaultFailMessage(this.manager)
        if (message) return message
        if (!this.series.length) return "No matching data"
        return ""
    }

    @computed private get yColumns(): CoreColumn[] {
        return this.yColumnSlugs.map((slug) => this.transformedTable.get(slug))
    }

    @computed protected get yColumnSlugs(): string[] {
        return autoDetectYColumnSlugs(this.manager)
    }

    @computed private get colorColumnSlug(): string | undefined {
        return this.manager.colorColumnSlug
    }

    @computed private get colorColumn(): CoreColumn {
        return this.transformedTable.get(this.colorColumnSlug)
    }

    @computed private get formatColumn(): CoreColumn {
        return this.yColumns[0]
    }

    @computed private get hasColorScale(): boolean {
        return !this.colorColumn.isMissing
    }

    // Color scale props

    @computed get colorScaleColumn(): CoreColumn {
        return (
            // For faceted charts, we have to get the values of inputTable before it's filtered by
            // the faceting logic.
            this.manager.colorScaleColumnOverride ??
            // We need to use inputTable in order to get consistent coloring for a variable across
            // charts, e.g. each continent being assigned to the same color.
            // inputTable is unfiltered, so it contains every value that exists in the variable.
            this.inputTable.get(this.colorColumnSlug)
        )
    }

    @computed get colorScaleConfig(): ColorScaleConfigInterface | undefined {
        return (
            ColorScaleConfig.fromDSL(this.colorColumn.def) ??
            this.manager.colorScale
        )
    }

    @computed get hasNoDataBin(): boolean {
        if (!this.hasColorScale) return false
        return this.colorColumn.valuesIncludingErrorValues.some(
            (value) => !isNotErrorValue(value)
        )
    }

    defaultBaseColorScheme = ColorSchemeName.OwidDistinctLines
    defaultNoDataColor = OwidNoDataGray
    colorScale = this.props.manager.colorScaleOverride ?? new ColorScale(this)

    private getColorScaleColor(value: CoreValueType | undefined): Color {
        return this.colorScale.getColor(value) ?? DEFAULT_LINE_COLOR
    }

    // End of color scale props

    // Color legend props

    @computed private get hasColorLegend(): boolean {
        return this.hasColorScale && !this.manager.hideLegend
    }

    @computed get legendX(): number {
        return this.bounds.x
    }

    @computed get legendMaxWidth(): number {
        return this.bounds.width
    }

    @computed get legendAlign(): HorizontalAlign {
        return HorizontalAlign.center
    }

    // TODO just pass colorScale to legend and let it figure it out?
    @computed get numericLegendData(): ColorScaleBin[] {
        // Move CategoricalBins to end
        return sortBy(
            this.colorScale.legendBins,
            (bin) => bin instanceof CategoricalBin
        )
    }

    // TODO just pass colorScale to legend and let it figure it out?
    @computed get equalSizeBins(): boolean | undefined {
        return this.colorScale.config.equalSizeBins
    }

    numericBinSize = 6
    numericBinStroke = BACKGROUND_COLOR
    numericBinStrokeWidth = 1
    legendTextColor = "#555"
    legendTickSize = 1

    @computed get numericLegend(): HorizontalNumericColorLegend | undefined {
        return this.hasColorScale && !this.manager.hideLegend
            ? new HorizontalNumericColorLegend({ manager: this })
            : undefined
    }

    @computed get numericLegendY(): number {
        return this.bounds.top
    }

    @computed get legendTitle(): string | undefined {
        return this.hasColorScale
            ? this.colorScale.legendDescription
            : undefined
    }

    @computed get legendHeight(): number {
        return this.numericLegend?.height ?? 0
    }

    // End of color legend props

    // todo: for now just works with 1 y column
    @computed private get annotationsMap(): Map<
        PrimitiveType,
        Set<PrimitiveType>
    > {
        return this.inputTable
            .getAnnotationColumnForColumn(this.yColumnSlugs[0])
            ?.getUniqueValuesGroupedBy(this.inputTable.entityNameSlug)
    }

    getAnnotationsForSeries(seriesName: SeriesName): string | undefined {
        const annotationsMap = this.annotationsMap
        const annos = annotationsMap?.get(seriesName)
        return annos
            ? Array.from(annos.values())
                  .filter((anno) => anno)
                  .join(" & ")
            : undefined
    }

    @computed private get colorScheme(): ColorScheme {
        return (
            (this.manager.baseColorScheme
                ? ColorSchemes[this.manager.baseColorScheme]
                : null) ?? ColorSchemes[this.defaultBaseColorScheme]
        )
    }

    @computed get seriesStrategy(): SeriesStrategy {
        return autoDetectSeriesStrategy(this.manager, true)
    }

    @computed get isLogScale(): boolean {
        return this.yAxisConfig.scaleType === ScaleType.log
    }

    @computed private get categoricalColorAssigner(): CategoricalColorAssigner {
        return new CategoricalColorAssigner({
            colorScheme: this.colorScheme,
            invertColorScheme: this.manager.invertColorScheme,
            colorMap:
                this.seriesStrategy === SeriesStrategy.entity
                    ? this.inputTable.entityNameColorIndex
                    : this.inputTable.columnDisplayNameToColorMap,
            autoColorMapCache: this.manager.seriesColorMap,
        })
    }

    private getSeriesName(
        entityName: EntityName,
        columnName: string,
        entityCount: number
    ): SeriesName {
        if (this.seriesStrategy === SeriesStrategy.entity) {
            return entityName
        }
        if (entityCount > 1 || this.manager.canSelectMultipleEntities) {
            return `${entityName} - ${columnName}`
        } else {
            return columnName
        }
    }

    private getColorKey(
        entityName: EntityName,
        columnName: string,
        entityCount: number
    ): SeriesName {
        if (this.seriesStrategy === SeriesStrategy.entity) {
            return entityName
        }
        // If only one entity is plotted, we want to use the column colors.
        // Unlike in `getSeriesName`, we don't care whether the user can select
        // multiple entities, only whether more than one is plotted.
        if (entityCount > 1) {
            return `${entityName} - ${columnName}`
        } else {
            return columnName
        }
    }

    // cache value for performance
    @computed private get rowIndicesByEntityName(): Map<string, number[]> {
        return this.transformedTable.rowIndex([
            this.transformedTable.entityNameSlug,
        ])
    }

    private constructSingleSeries(
        entityName: string,
        col: CoreColumn
    ): LineChartSeries {
        const { hasColorScale, transformedTable, colorColumn } = this

        // Construct the points
        const timeValues = col.originalTimeColumn.valuesIncludingErrorValues
        const values = col.valuesIncludingErrorValues
        const colorValues = colorColumn.valuesIncludingErrorValues
        // If Y and Color are the same column, we need to get rid of any duplicate rows.
        // Duplicates occur because Y doesn't have tolerance applied, but Color does.
        const rowIndexes = sortedUniqBy(
            this.rowIndicesByEntityName
                .get(entityName)!
                .filter((index) => isNumber(values[index])),
            (index) => timeValues[index]
        )
        const points = rowIndexes.map((index) => {
            const point: LinePoint = {
                x: timeValues[index] as number,
                y: values[index] as number,
            }
            if (hasColorScale) {
                const colorValue = colorValues[index]
                point.colorValue = isNotErrorValue(colorValue)
                    ? colorValue
                    : undefined
            }
            return point
        })

        // Construct series properties
        const totalEntityCount = transformedTable.availableEntityNames.length
        const seriesName = this.getSeriesName(
            entityName,
            col.displayName,
            totalEntityCount
        )
        let seriesColor: Color
        if (hasColorScale) {
            const colorValue = last(points)?.colorValue
            seriesColor = this.getColorScaleColor(colorValue)
        } else {
            seriesColor = this.categoricalColorAssigner.assign(
                this.getColorKey(entityName, col.displayName, totalEntityCount)
            )
        }

        return {
            points,
            seriesName,
            isProjection: col.isProjection,
            color: seriesColor,
        }
    }

    @computed get series(): readonly LineChartSeries[] {
        return flatten(
            this.yColumns.map((col) =>
                col.uniqEntityNames.map(
                    (entityName): LineChartSeries =>
                        this.constructSingleSeries(entityName, col)
                )
            )
        )
    }

    // TODO: remove, seems unused
    @computed get allPoints(): LinePoint[] {
        return flatten(this.series.map((series) => series.points))
    }

    @computed get placedSeries(): PlacedLineChartSeries[] {
        const { dualAxis } = this
        const { horizontalAxis, verticalAxis } = dualAxis

        return this.series
            .slice()
            .reverse()
            .map((series) => {
                return {
                    ...series,
                    placedPoints: series.points.map(
                        (point): PlacedPoint => ({
                            x: round(horizontalAxis.place(point.x), 1),
                            y: round(verticalAxis.place(point.y), 1),
                            color: this.hasColorScale
                                ? darkenColorForLine(
                                      this.getColorScaleColor(point.colorValue)
                                  )
                                : series.color,
                        })
                    ),
                }
            })
    }

    // Order of the legend items on a line chart should visually correspond
    // to the order of the lines as the approach the legend
    @computed get labelSeries(): LineLabelSeries[] {
        // If there are any projections, ignore non-projection legends
        // Bit of a hack
        let seriesToShow = this.series
        if (seriesToShow.some((series) => !!series.isProjection))
            seriesToShow = seriesToShow.filter((series) => series.isProjection)

        return seriesToShow.map((series) => {
            const { seriesName, color } = series
            const lastValue = last(series.points)!.y
            return {
                color,
                seriesName,
                // E.g. https://ourworldindata.org/grapher/size-poverty-gap-world
                label: this.manager.hideLegend ? "" : `${seriesName}`,
                annotation: this.getAnnotationsForSeries(seriesName),
                yValue: lastValue,
            }
        })
    }

    @computed private get xAxisConfig(): AxisConfig {
        return new AxisConfig(
            {
                hideGridlines: true,
                ...this.manager.xAxisConfig,
            },
            this
        )
    }

    @computed private get horizontalAxisPart(): HorizontalAxis {
        const axis = this.xAxisConfig.toHorizontalAxis()
        axis.updateDomainPreservingUserSettings(
            this.transformedTable.timeDomainFor(this.yColumnSlugs)
        )
        axis.scaleType = ScaleType.linear
        axis.formatColumn = this.inputTable.timeColumn
        axis.hideFractionalTicks = true
        return axis
    }

    @computed private get yAxisConfig(): AxisConfig {
        // TODO: enable nice axis ticks for linear scales
        return new AxisConfig(
            {
                // if we only have a single y value (probably 0), we want the
                // horizontal axis to be at the bottom of the chart.
                // see https://github.com/owid/owid-grapher/pull/975#issuecomment-890798547
                singleValueAxisPointAlign: AxisAlign.start,
                ...this.manager.yAxisConfig,
            },
            this
        )
    }

    @computed private get verticalAxisPart(): VerticalAxis {
        const axisConfig = this.yAxisConfig
        const yDomain = this.transformedTable.domainFor(this.yColumnSlugs)
        const domain = axisConfig.domain
        const axis = axisConfig.toVerticalAxis()
        axis.updateDomainPreservingUserSettings([
            Math.min(domain[0], yDomain[0]),
            Math.max(domain[1], yDomain[1]),
        ])
        axis.hideFractionalTicks = this.yColumns.every(
            (yColumn) => yColumn.isAllIntegers
        ) // all y axis points are integral, don't show fractional ticks in that case
        axis.label = ""
        axis.formatColumn = this.formatColumn
        return axis
    }

    @computed get dualAxis(): DualAxis {
        return new DualAxis({
            bounds: this.boundsWithoutColorLegend
                .padRight(
                    this.lineLegendDimensions
                        ? this.lineLegendDimensions.width
                        : this.defaultRightPadding
                )
                // top padding leaves room for tick labels
                .padTop(6)
                // bottom padding avoids axis labels to be cut off at some resolutions
                .padBottom(2),
            verticalAxis: this.verticalAxisPart,
            horizontalAxis: this.horizontalAxisPart,
        })
    }

    @computed get yAxis(): VerticalAxis {
        return this.dualAxis.verticalAxis
    }

    @computed get xAxis(): HorizontalAxis {
        return this.dualAxis.horizontalAxis
    }

    @computed get externalLegend(): HorizontalColorLegendManager | undefined {
        if (this.manager.hideLegend) {
            const numericLegendData = this.hasColorScale
                ? this.numericLegendData
                : []
            const categoricalLegendData = this.hasColorScale
                ? []
                : this.series.map(
                      (series, index) =>
                          new CategoricalBin({
                              index,
                              value: series.seriesName,
                              label: series.seriesName,
                              color: series.color,
                          })
                  )
            return {
                legendTitle: this.legendTitle,
                legendTextColor: this.legendTextColor,
                legendTickSize: this.legendTickSize,
                equalSizeBins: this.equalSizeBins,
                numericBinSize: this.numericBinSize,
                numericBinStroke: this.numericBinStroke,
                numericBinStrokeWidth: this.numericBinStrokeWidth,
                numericLegendData,
                categoricalLegendData,
            }
        }
        return undefined
    }
}
