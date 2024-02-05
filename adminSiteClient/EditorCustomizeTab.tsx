import React from "react"
import { observable, computed, action } from "mobx"
import { observer } from "mobx-react"
import { ChartEditor } from "./ChartEditor.js"
import {
    ComparisonLineConfig,
    ColorSchemeName,
    FacetAxisDomain,
    FacetStrategy,
} from "@ourworldindata/types"
import { Grapher } from "@ourworldindata/grapher"
import {
    NumberField,
    Toggle,
    FieldsRow,
    Section,
    BindString,
    TextField,
    Button,
    RadioGroup,
} from "./Forms.js"
import {
    debounce,
    isEqual,
    omit,
    trimObject,
    TimeBoundValue,
    SortOrder,
    SortBy,
    SortConfig,
} from "@ourworldindata/utils"
import { faPlus, faMinus } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome/index.js"
import {
    ColorSchemeDropdown,
    ColorSchemeOption,
} from "./ColorSchemeDropdown.js"
import { EditorColorScaleSection } from "./EditorColorScaleSection.js"
import Select from "react-select"

@observer
export class ColorSchemeSelector extends React.Component<{ grapher: Grapher }> {
    @action.bound onChange(selected: ColorSchemeOption) {
        // The onChange method can return an array of values (when multiple
        // items can be selected) or a single value. Since we are certain that
        // we are not using the multi-option select we can force the type to be
        // a single value.

        this.props.grapher.baseColorScheme = (
            selected.value === "default" ? undefined : selected.value
        ) as ColorSchemeName

        // clear out saved, pre-computed colors so the color scheme change is immediately visible
        this.props.grapher.seriesColorMap?.clear()
    }

    @action.bound onInvertColorScheme(value: boolean) {
        this.props.grapher.invertColorScheme = value || undefined

        this.props.grapher.seriesColorMap?.clear()
    }

    render() {
        const { grapher } = this.props

        return (
            <React.Fragment>
                <FieldsRow>
                    <div className="form-group">
                        <label>Color scheme</label>
                        <ColorSchemeDropdown
                            value={grapher.baseColorScheme || "default"}
                            onChange={this.onChange}
                            chartType={this.props.grapher.type}
                            invertedColorScheme={!!grapher.invertColorScheme}
                            additionalOptions={[
                                {
                                    colorScheme: undefined,
                                    gradient: undefined,
                                    label: "Default",
                                    value: "default",
                                },
                            ]}
                        />
                    </div>
                </FieldsRow>
                <FieldsRow>
                    <Toggle
                        label="Invert colors"
                        value={!!grapher.invertColorScheme}
                        onValue={this.onInvertColorScheme}
                    />
                </FieldsRow>
            </React.Fragment>
        )
    }
}

interface SortOrderDropdownOption {
    label: string
    value: Omit<SortConfig, "sortOrder">
    display?: { name: string; displayName: string }
}

@observer
class SortOrderSection extends React.Component<{ editor: ChartEditor }> {
    @computed get sortConfig(): SortConfig {
        return this.grapher._sortConfig
    }

    @computed get grapher() {
        return this.props.editor.grapher
    }

    @computed get sortOptions(): SortOrderDropdownOption[] {
        const { features } = this.props.editor

        let dimensionSortOptions: SortOrderDropdownOption[] = []
        if (features.canSortByColumn) {
            dimensionSortOptions = this.grapher.yColumnsFromDimensions.map(
                (column): SortOrderDropdownOption => ({
                    label: column.displayName,
                    display: {
                        name: column.name,
                        displayName: column.displayName,
                    },
                    value: {
                        sortBy: SortBy.column,
                        sortColumnSlug: column.slug,
                    } as SortConfig,
                })
            )
        }

        return [
            { label: "Entity name", value: { sortBy: SortBy.entityName } },
            { label: "Total value", value: { sortBy: SortBy.total } },
            {
                label: "Custom order (use specified entity order)",
                value: { sortBy: SortBy.custom },
            },
            ...dimensionSortOptions,
        ]
    }

    @action.bound onSortByChange(selected: SortOrderDropdownOption | null) {
        this.grapher.sortBy = selected?.value.sortBy
        this.grapher.sortColumnSlug = selected?.value.sortColumnSlug
    }

    @action.bound onSortOrderChange(sortOrder: string) {
        this.grapher.sortOrder = sortOrder as SortOrder
    }

    render() {
        return (
            <Section name="Sort Order">
                <small className="form-text text-muted">
                    For line charts the sort order is only applied when it's
                    collapsed to a bar chart.
                </small>
                <div className="form-group">
                    Sort by
                    <Select
                        options={this.sortOptions}
                        onChange={this.onSortByChange}
                        value={this.sortOptions.find((opt) =>
                            isEqual(
                                opt.value,
                                trimObject(omit(this.sortConfig, "sortOrder"))
                            )
                        )}
                        formatOptionLabel={(opt, { context }) =>
                            opt.display && context === "menu" ? (
                                <span>
                                    {opt.display.displayName}
                                    <br />
                                    <small style={{ opacity: 0.8 }}>
                                        {opt.display.name}
                                    </small>
                                </span>
                            ) : (
                                opt.label
                            )
                        }
                        menuPlacement="auto"
                    />
                </div>
                <div className="form-group">
                    Sort order
                    <RadioGroup
                        options={[
                            { label: "Descending", value: SortOrder.desc },
                            { label: "Ascending", value: SortOrder.asc },
                        ]}
                        value={this.sortConfig.sortOrder}
                        onChange={this.onSortOrderChange}
                    />
                </div>
            </Section>
        )
    }
}

@observer
class FacetSection extends React.Component<{ editor: ChartEditor }> {
    base: React.RefObject<HTMLDivElement> = React.createRef()

    @computed get grapher() {
        return this.props.editor.grapher
    }

    @computed get facetOptions(): Array<{
        label: string
        value?: FacetStrategy
    }> {
        return [{ label: "auto" }].concat(
            this.grapher.availableFacetStrategies.map((s) => {
                return { label: s.toString(), value: s }
            })
        )
    }

    @computed get facetSelection(): { label: string; value?: FacetStrategy } {
        const strategy = this.grapher.selectedFacetStrategy
        if (strategy) {
            return { label: strategy.toString(), value: strategy }
        }

        return { label: "auto" }
    }

    @action.bound onFacetSelectionChange(
        selected: {
            label: string
            value?: FacetStrategy
        } | null
    ) {
        this.grapher.selectedFacetStrategy = selected?.value
    }

    render() {
        const yAxisConfig = this.props.editor.grapher.yAxis

        return (
            <Section name="Faceting">
                <div className="form-group">
                    Faceting strategy
                    <Select
                        options={this.facetOptions}
                        value={this.facetSelection}
                        onChange={this.onFacetSelectionChange}
                    />
                </div>
                <FieldsRow>
                    <Toggle
                        label={`Hide facet control`}
                        value={this.grapher.hideFacetControl || false}
                        onValue={(value) => {
                            this.grapher.hideFacetControl = value || undefined
                        }}
                    />
                </FieldsRow>
                <FieldsRow>
                    <Toggle
                        label={`Facets have uniform y-axis`}
                        value={
                            yAxisConfig.facetDomain === FacetAxisDomain.shared
                        }
                        onValue={(value) => {
                            yAxisConfig.facetDomain = value
                                ? FacetAxisDomain.shared
                                : FacetAxisDomain.independent
                        }}
                    />
                </FieldsRow>
            </Section>
        )
    }
}

@observer
class TimelineSection extends React.Component<{ editor: ChartEditor }> {
    base: React.RefObject<HTMLDivElement> = React.createRef()

    @computed get grapher() {
        return this.props.editor.grapher
    }

    @computed get minTime() {
        return this.grapher.minTime
    }
    @computed get maxTime() {
        return this.grapher.maxTime
    }

    @computed get timelineMinTime() {
        return this.grapher.timelineMinTime
    }
    @computed get timelineMaxTime() {
        return this.grapher.timelineMaxTime
    }

    @action.bound onMinTime(value: number | undefined) {
        this.grapher.minTime = value ?? TimeBoundValue.negativeInfinity
    }

    @action.bound onMaxTime(value: number | undefined) {
        this.grapher.maxTime = value ?? TimeBoundValue.positiveInfinity
    }

    @action.bound onTimelineMinTime(value: number | undefined) {
        this.grapher.timelineMinTime = value
    }

    @action.bound onTimelineMaxTime(value: number | undefined) {
        this.grapher.timelineMaxTime = value
    }

    @action.bound onToggleHideTimeline(value: boolean) {
        this.grapher.hideTimeline = value || undefined
    }

    @action.bound onToggleShowYearLabels(value: boolean) {
        this.grapher.showYearLabels = value || undefined
    }

    render() {
        const { features } = this.props.editor
        const { grapher } = this

        return (
            <Section name="Timeline selection">
                <FieldsRow>
                    {features.timeDomain && (
                        <NumberField
                            label="Selection start"
                            value={this.minTime}
                            onValue={debounce(this.onMinTime)}
                            allowNegative
                        />
                    )}
                    <NumberField
                        label={
                            features.timeDomain
                                ? "Selection end"
                                : "Selected year"
                        }
                        value={this.maxTime}
                        onValue={debounce(this.onMaxTime)}
                        allowNegative
                    />
                </FieldsRow>
                {features.timelineRange && (
                    <FieldsRow>
                        <NumberField
                            label="Timeline min"
                            value={this.timelineMinTime}
                            onValue={debounce(this.onTimelineMinTime)}
                            allowNegative
                        />
                        <NumberField
                            label="Timeline max"
                            value={this.timelineMaxTime}
                            onValue={debounce(this.onTimelineMaxTime)}
                            allowNegative
                        />
                    </FieldsRow>
                )}
                <FieldsRow>
                    <Toggle
                        label="Hide timeline"
                        value={!!grapher.hideTimeline}
                        onValue={this.onToggleHideTimeline}
                    />
                    {features.showYearLabels && (
                        <Toggle
                            label="Always show year labels"
                            value={!!grapher.showYearLabels}
                            onValue={this.onToggleShowYearLabels}
                        />
                    )}
                </FieldsRow>
            </Section>
        )
    }
}

@observer
class ComparisonLineSection extends React.Component<{ editor: ChartEditor }> {
    @observable comparisonLines: ComparisonLineConfig[] = []

    @action.bound onAddComparisonLine() {
        const { grapher } = this.props.editor
        grapher.comparisonLines.push({})
    }

    @action.bound onRemoveComparisonLine(index: number) {
        const { grapher } = this.props.editor
        grapher.comparisonLines!.splice(index, 1)
    }

    render() {
        const { comparisonLines } = this.props.editor.grapher

        return (
            <Section name="Comparison line">
                <p>
                    Overlay a line onto the chart for comparison. Supports basic{" "}
                    <a href="https://github.com/silentmatt/expr-eval#expression-syntax">
                        mathematical expressions
                    </a>
                    .
                </p>

                <Button onClick={this.onAddComparisonLine}>
                    <FontAwesomeIcon icon={faPlus} /> Add comparison line
                </Button>
                {comparisonLines.map((comparisonLine, i) => (
                    <div key={i}>
                        {`Line ${i + 1}`}{" "}
                        <Button onClick={() => this.onRemoveComparisonLine(i)}>
                            <FontAwesomeIcon icon={faMinus} />
                        </Button>
                        <TextField
                            label={`y=`}
                            placeholder="x"
                            value={comparisonLine.yEquals}
                            onValue={action((value: string) => {
                                comparisonLine.yEquals = value || undefined
                            })}
                        />
                        <TextField
                            label="Label"
                            value={comparisonLine.label}
                            onValue={action((value: string) => {
                                comparisonLine.label = value || undefined
                            })}
                        />
                    </div>
                ))}
            </Section>
        )
    }
}

@observer
export class EditorCustomizeTab extends React.Component<{
    editor: ChartEditor
}> {
    @computed get errorMessages() {
        return this.props.editor.manager.errorMessages
    }

    render() {
        const xAxisConfig = this.props.editor.grapher.xAxis
        const yAxisConfig = this.props.editor.grapher.yAxis

        const { features } = this.props.editor
        const { grapher } = this.props.editor

        return (
            <div>
                {features.canCustomizeYAxis && (
                    <Section name="Y Axis">
                        {features.canCustomizeYAxisScale && (
                            <React.Fragment>
                                <FieldsRow>
                                    <NumberField
                                        label={`Min`}
                                        value={yAxisConfig.min}
                                        onValue={(value) =>
                                            (yAxisConfig.min = value)
                                        }
                                        allowDecimal
                                        allowNegative
                                    />
                                    <NumberField
                                        label={`Max`}
                                        value={yAxisConfig.max}
                                        onValue={(value) =>
                                            (yAxisConfig.max = value)
                                        }
                                        allowDecimal
                                        allowNegative
                                    />
                                </FieldsRow>
                                {features.canRemovePointsOutsideAxisDomain && (
                                    <FieldsRow>
                                        <Toggle
                                            label={`Remove points outside domain`}
                                            value={
                                                yAxisConfig.removePointsOutsideDomain ||
                                                false
                                            }
                                            onValue={(value) =>
                                                (yAxisConfig.removePointsOutsideDomain =
                                                    value || undefined)
                                            }
                                        />
                                    </FieldsRow>
                                )}
                                <FieldsRow>
                                    <Toggle
                                        label={`Enable log/linear selector`}
                                        value={
                                            yAxisConfig.canChangeScaleType ||
                                            false
                                        }
                                        onValue={(value) =>
                                            (yAxisConfig.canChangeScaleType =
                                                value || undefined)
                                        }
                                    />
                                </FieldsRow>
                            </React.Fragment>
                        )}
                        {features.canCustomizeYAxisLabel && (
                            <BindString
                                label="Label"
                                field="label"
                                store={yAxisConfig}
                                errorMessage={this.errorMessages.axisLabelY}
                            />
                        )}
                    </Section>
                )}
                {features.canCustomizeXAxis && (
                    <Section name="X Axis">
                        {features.canCustomizeXAxisScale && (
                            <React.Fragment>
                                <FieldsRow>
                                    <NumberField
                                        label={`Min`}
                                        value={xAxisConfig.min}
                                        onValue={(value) =>
                                            (xAxisConfig.min = value)
                                        }
                                        allowDecimal
                                        allowNegative
                                    />
                                    <NumberField
                                        label={`Max`}
                                        value={xAxisConfig.max}
                                        onValue={(value) =>
                                            (xAxisConfig.max = value)
                                        }
                                        allowDecimal
                                        allowNegative
                                    />
                                </FieldsRow>
                                {features.canRemovePointsOutsideAxisDomain && (
                                    <FieldsRow>
                                        <Toggle
                                            label={`Remove points outside domain`}
                                            value={
                                                xAxisConfig.removePointsOutsideDomain ||
                                                false
                                            }
                                            onValue={(value) =>
                                                (xAxisConfig.removePointsOutsideDomain =
                                                    value || undefined)
                                            }
                                        />
                                    </FieldsRow>
                                )}
                                <FieldsRow>
                                    <Toggle
                                        label={`Enable log/linear selector`}
                                        value={
                                            xAxisConfig.canChangeScaleType ||
                                            false
                                        }
                                        onValue={(value) =>
                                            (xAxisConfig.canChangeScaleType =
                                                value || undefined)
                                        }
                                    />
                                </FieldsRow>
                            </React.Fragment>
                        )}
                        {features.canCustomizeXAxisLabel && (
                            <BindString
                                label="Label"
                                field="label"
                                store={xAxisConfig}
                                errorMessage={this.errorMessages.axisLabelX}
                            />
                        )}
                    </Section>
                )}
                <TimelineSection editor={this.props.editor} />
                <FacetSection editor={this.props.editor} />
                <Section name="Color scheme">
                    <ColorSchemeSelector grapher={grapher} />
                </Section>
                {features.canSpecifySortOrder && (
                    <SortOrderSection editor={this.props.editor} />
                )}
                {grapher.chartInstanceExceptMap.colorScale && (
                    <EditorColorScaleSection
                        scale={grapher.chartInstanceExceptMap.colorScale}
                        chartType={grapher.type}
                        showLineChartColors={grapher.isLineChart}
                        features={{
                            visualScaling: true,
                            legendDescription: true,
                        }}
                    />
                )}
                <Section name="Legend">
                    {features.hideLegend && (
                        <FieldsRow>
                            <Toggle
                                label={`Hide legend`}
                                value={!!grapher.hideLegend}
                                onValue={(value) =>
                                    (grapher.hideLegend = value || undefined)
                                }
                            />
                        </FieldsRow>
                    )}
                    <FieldsRow>
                        <BindString
                            label="Entity name (singular)"
                            field="entityType"
                            store={grapher}
                        />
                        <BindString
                            label="Entity name (plural)"
                            field="entityTypePlural"
                            store={grapher}
                        />
                    </FieldsRow>
                    {features.canCustomizeVariableType && (
                        <FieldsRow>
                            <BindString
                                label={
                                    <>
                                        Split by <s>metric</s>
                                    </>
                                }
                                field="facettingLabelByYVariables"
                                store={grapher}
                                helpText={
                                    "When facetting is active, one option is to split " +
                                    "by entity/country, the other is by metric. This option  " +
                                    'lets you override "metric" with a custom word like ' +
                                    '"products" or "species".'
                                }
                            />
                        </FieldsRow>
                    )}
                </Section>
                {features.relativeModeToggle && (
                    <Section name="Controls">
                        <FieldsRow>
                            <Toggle
                                label={`Hide relative toggle`}
                                value={!!grapher.hideRelativeToggle}
                                onValue={(value) =>
                                    (grapher.hideRelativeToggle =
                                        value || false)
                                }
                            />
                        </FieldsRow>
                    </Section>
                )}
                {features.canHideTotalValueLabel && (
                    <Section name="Display">
                        <FieldsRow>
                            <Toggle
                                label={`Hide total value label`}
                                value={!!grapher.hideTotalValueLabel}
                                onValue={(value) =>
                                    (grapher.hideTotalValueLabel =
                                        value || false)
                                }
                            />
                        </FieldsRow>
                    </Section>
                )}
                {features.comparisonLine && (
                    <ComparisonLineSection editor={this.props.editor} />
                )}
            </div>
        )
    }
}
