import { SynthesizeGDPTable } from "@ourworldindata/core-table"
import {
    ChartTypeName,
    FacetStrategy,
    GrapherTabOption,
    SeriesStrategy,
} from "@ourworldindata/types"
import { DEFAULT_BOUNDS } from "@ourworldindata/utils"
import React from "react"
import {
    CaptionedChart,
    CaptionedChartManager,
    StaticCaptionedChart,
} from "./CaptionedChart"

export default {
    title: "CaptionedChart",
    component: CaptionedChart,
}

const table = SynthesizeGDPTable({ entityCount: 5 })

const manager: CaptionedChartManager = {
    captionedChartBounds: DEFAULT_BOUNDS,
    table,
    selection: table.availableEntityNames,
    currentTitle: "This is the Title",
    subtitle: "A Subtitle",
    note: "Here are some footer notes",
    isReady: true,
    availableFacetStrategies: [FacetStrategy.none],
    detailRenderers: [],
}

export const LineChart = (): React.ReactElement => (
    <CaptionedChart manager={manager} />
)

export const StaticLineChartForExport = (): React.ReactElement => {
    return (
        <StaticCaptionedChart
            manager={{
                ...manager,
                isExportingToSvgOrPng: true,
            }}
        />
    )
}

export const MapChart = (): React.ReactElement => (
    <CaptionedChart manager={{ ...manager, tab: GrapherTabOption.map }} />
)
export const StackedArea = (): React.ReactElement => (
    <CaptionedChart
        manager={{
            ...manager,
            type: ChartTypeName.StackedArea,
            seriesStrategy: SeriesStrategy.entity,
        }}
    />
)
export const Scatter = (): React.ReactElement => (
    <CaptionedChart
        manager={{
            ...manager,
            type: ChartTypeName.ScatterPlot,
            table: table.filterByTargetTimes([1999], 0),
        }}
    />
)
