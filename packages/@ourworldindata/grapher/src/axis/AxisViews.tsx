import React from "react"
import { computed } from "mobx"
import { observer } from "mobx-react"
import {
    Bounds,
    DEFAULT_BOUNDS,
    HorizontalAlign,
    Position,
    VerticalAlign,
    dyFromAlign,
    textAnchorFromAlign,
} from "@ourworldindata/utils"
import { VerticalAxis, HorizontalAxis, DualAxis } from "./Axis"
import classNames from "classnames"
import { GRAPHER_DARK_TEXT } from "../core/GrapherConstants"
import { ScaleType, DetailsMarker } from "@ourworldindata/types"

const dasharrayFromFontSize = (fontSize: number): string => {
    const dashLength = Math.round((fontSize / 16) * 3)
    const spaceLength = Math.round((dashLength * 2) / 3)
    return `${dashLength},${spaceLength}`
}

const TICK_COLOR = "#ddd"
const FAINT_TICK_COLOR = "#eee"
const SOLID_TICK_COLOR = "#999"

@observer
export class VerticalAxisGridLines extends React.Component<{
    verticalAxis: VerticalAxis
    bounds: Bounds
    strokeWidth?: number
}> {
    render(): JSX.Element {
        const { bounds, verticalAxis, strokeWidth } = this.props
        const axis = verticalAxis.clone()
        axis.range = bounds.yRange()

        return (
            <g className={classNames("AxisGridLines", "horizontalLines")}>
                {axis.getTickValues().map((t, i) => {
                    const color = t.faint
                        ? FAINT_TICK_COLOR
                        : t.solid
                        ? SOLID_TICK_COLOR
                        : TICK_COLOR

                    return (
                        <line
                            key={i}
                            x1={bounds.left.toFixed(2)}
                            y1={axis.place(t.value)}
                            x2={bounds.right.toFixed(2)}
                            y2={axis.place(t.value)}
                            stroke={color}
                            strokeWidth={strokeWidth}
                            strokeDasharray={
                                t.solid
                                    ? undefined
                                    : dasharrayFromFontSize(
                                          verticalAxis.tickFontSize
                                      )
                            }
                        />
                    )
                })}
            </g>
        )
    }
}

@observer
export class HorizontalAxisGridLines extends React.Component<{
    horizontalAxis: HorizontalAxis
    bounds?: Bounds
    strokeWidth?: number
}> {
    @computed get bounds(): Bounds {
        return this.props.bounds ?? DEFAULT_BOUNDS
    }

    render(): JSX.Element {
        const { horizontalAxis, strokeWidth } = this.props
        const { bounds } = this
        const axis = horizontalAxis.clone()
        axis.range = bounds.xRange()

        return (
            <g className={classNames("AxisGridLines", "verticalLines")}>
                {axis.getTickValues().map((t, i) => {
                    const color = t.faint
                        ? FAINT_TICK_COLOR
                        : t.solid
                        ? SOLID_TICK_COLOR
                        : TICK_COLOR

                    return (
                        <line
                            key={i}
                            x1={axis.place(t.value)}
                            y1={bounds.bottom.toFixed(2)}
                            x2={axis.place(t.value)}
                            y2={bounds.top.toFixed(2)}
                            stroke={color}
                            strokeWidth={strokeWidth}
                            strokeDasharray={
                                t.solid
                                    ? undefined
                                    : dasharrayFromFontSize(
                                          horizontalAxis.tickFontSize
                                      )
                            }
                        />
                    )
                })}
            </g>
        )
    }
}

@observer
export class HorizontalAxisZeroLine extends React.Component<{
    horizontalAxis: HorizontalAxis
    bounds: Bounds
    strokeWidth?: number
}> {
    render(): JSX.Element {
        const { bounds, horizontalAxis, strokeWidth } = this.props
        const axis = horizontalAxis.clone()
        axis.range = bounds.xRange()

        return (
            <g
                className={classNames(
                    "AxisGridLines",
                    "verticalLines",
                    "zeroLine"
                )}
            >
                <line
                    x1={axis.place(0)}
                    y1={bounds.bottom.toFixed(2)}
                    x2={axis.place(0)}
                    y2={bounds.top.toFixed(2)}
                    stroke={SOLID_TICK_COLOR}
                    strokeWidth={strokeWidth}
                />
            </g>
        )
    }
}

interface DualAxisViewProps {
    dualAxis: DualAxis
    highlightValue?: { x: number; y: number }
    showTickMarks?: boolean
    labelColor?: string
    tickColor?: string
    lineWidth?: number
    dodMarker?: DetailsMarker
}

@observer
export class DualAxisComponent extends React.Component<DualAxisViewProps> {
    render(): JSX.Element {
        const {
            dualAxis,
            showTickMarks,
            labelColor,
            tickColor,
            lineWidth,
            dodMarker,
        } = this.props
        const { bounds, horizontalAxis, verticalAxis, innerBounds } = dualAxis

        const verticalGridlines = verticalAxis.hideGridlines ? null : (
            <VerticalAxisGridLines
                verticalAxis={verticalAxis}
                bounds={innerBounds}
                strokeWidth={lineWidth}
            />
        )

        const horizontalGridlines = horizontalAxis.hideGridlines ? null : (
            <HorizontalAxisGridLines
                horizontalAxis={horizontalAxis}
                bounds={innerBounds}
                strokeWidth={lineWidth}
            />
        )

        const verticalAxisComponent = verticalAxis.hideAxis ? null : (
            <VerticalAxisComponent
                bounds={bounds}
                verticalAxis={verticalAxis}
                labelColor={labelColor}
                tickColor={tickColor}
                dodMarker={dodMarker}
            />
        )

        const horizontalAxisComponent = horizontalAxis.hideAxis ? null : (
            <HorizontalAxisComponent
                bounds={bounds}
                axis={horizontalAxis}
                showTickMarks={showTickMarks}
                preferredAxisPosition={innerBounds.bottom}
                labelColor={labelColor}
                tickColor={tickColor}
                tickMarkWidth={lineWidth}
                dodMarker={dodMarker}
            />
        )

        return (
            <g className="DualAxisView">
                {horizontalAxisComponent}
                {verticalAxisComponent}
                {verticalGridlines}
                {horizontalGridlines}
            </g>
        )
    }
}

@observer
export class VerticalAxisComponent extends React.Component<{
    bounds: Bounds
    verticalAxis: VerticalAxis
    labelColor?: string
    tickColor?: string
    dodMarker?: DetailsMarker
}> {
    render(): JSX.Element {
        const { bounds, verticalAxis, labelColor, tickColor, dodMarker } =
            this.props
        const { tickLabels, labelTextWrap } = verticalAxis

        return (
            <g className="VerticalAxis">
                {labelTextWrap &&
                    labelTextWrap.renderSVG(
                        -verticalAxis.rangeCenter - labelTextWrap.width / 2,
                        bounds.left,
                        {
                            textProps: {
                                transform: "rotate(-90)",
                                fill: labelColor || GRAPHER_DARK_TEXT,
                            },
                            dodMarker,
                        }
                    )}
                {tickLabels.map((label, i) => {
                    const { y, xAlign, yAlign, formattedValue } = label
                    return (
                        <text
                            key={i}
                            x={(
                                bounds.left +
                                verticalAxis.width -
                                verticalAxis.labelPadding
                            ).toFixed(2)}
                            y={y}
                            dy={dyFromAlign(yAlign ?? VerticalAlign.middle)}
                            textAnchor={textAnchorFromAlign(
                                xAlign ?? HorizontalAlign.right
                            )}
                            fill={tickColor || GRAPHER_DARK_TEXT}
                            fontSize={verticalAxis.tickFontSize}
                        >
                            {formattedValue}
                        </text>
                    )
                })}
            </g>
        )
    }
}

export class HorizontalAxisComponent extends React.Component<{
    bounds: Bounds
    axis: HorizontalAxis
    showTickMarks?: boolean
    preferredAxisPosition?: number
    labelColor?: string
    tickColor?: string
    tickMarkWidth?: number
    dodMarker?: DetailsMarker
}> {
    @computed get scaleType(): ScaleType {
        return this.props.axis.scaleType
    }

    set scaleType(scaleType: ScaleType) {
        this.props.axis.config.scaleType = scaleType
    }

    // for scale selector. todo: cleanup
    @computed get bounds(): Bounds {
        const { bounds, axis } = this.props
        if (axis.orient === Position.top)
            return new Bounds(bounds.right, bounds.top + 30, 100, 100)
        else return new Bounds(bounds.right, bounds.bottom - 30, 100, 100)
    }

    render(): JSX.Element {
        const {
            bounds,
            axis,
            showTickMarks,
            preferredAxisPosition,
            labelColor,
            tickColor,
            tickMarkWidth,
            dodMarker,
        } = this.props
        const { tickLabels, labelTextWrap: label, labelOffset, orient } = axis
        const horizontalAxisLabelsOnTop = orient === Position.top
        const labelYPosition = horizontalAxisLabelsOnTop
            ? bounds.top
            : bounds.bottom - (label?.height ?? 0)

        const tickMarksYPosition = horizontalAxisLabelsOnTop
            ? bounds.top + axis.height - 5
            : preferredAxisPosition ?? bounds.bottom

        const tickMarks = showTickMarks ? (
            <AxisTickMarks
                tickMarkTopPosition={tickMarksYPosition}
                tickMarkXPositions={tickLabels.map((label): number =>
                    axis.place(label.value)
                )}
                color={SOLID_TICK_COLOR}
                width={tickMarkWidth}
            />
        ) : undefined

        const tickLabelYPlacement = horizontalAxisLabelsOnTop
            ? bounds.top + labelOffset + 10
            : bounds.bottom - labelOffset
        return (
            <g className="HorizontalAxis">
                {label &&
                    label.renderSVG(
                        axis.rangeCenter - label.width / 2,
                        labelYPosition,
                        {
                            textProps: {
                                fill: labelColor || GRAPHER_DARK_TEXT,
                            },
                            dodMarker,
                        }
                    )}
                {tickMarks}
                {tickLabels.map((label, i) => {
                    const { x, xAlign, formattedValue } = label
                    return (
                        <text
                            key={i}
                            x={x}
                            y={tickLabelYPlacement}
                            fill={tickColor || GRAPHER_DARK_TEXT}
                            textAnchor={textAnchorFromAlign(
                                xAlign ?? HorizontalAlign.center
                            )}
                            fontSize={axis.tickFontSize}
                        >
                            {formattedValue}
                        </text>
                    )
                })}
            </g>
        )
    }
}

export class AxisTickMarks extends React.Component<{
    tickMarkTopPosition: number
    tickMarkXPositions: number[]
    color: string
    width?: number
}> {
    render(): JSX.Element[] {
        const { tickMarkTopPosition, tickMarkXPositions, color, width } =
            this.props
        const tickSize = 5
        const tickBottom = tickMarkTopPosition + tickSize
        return tickMarkXPositions.map((tickMarkPosition, index) => {
            return (
                <line
                    key={index}
                    x1={tickMarkPosition}
                    y1={tickMarkTopPosition}
                    x2={tickMarkPosition}
                    y2={tickBottom}
                    stroke={color}
                    strokeWidth={width}
                />
            )
        })
    }
}
