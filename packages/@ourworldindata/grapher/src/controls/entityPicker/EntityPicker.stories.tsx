import React from "react"
import { EntityPicker } from "./EntityPicker"
import { observer } from "mobx-react"
import {
    SampleColumnSlugs,
    SynthesizeGDPTable,
} from "@ourworldindata/core-table"
import { EntityName, OwidTableSlugs, SortOrder } from "@ourworldindata/types"
import { EntityPickerManager } from "./EntityPickerConstants"
import { computed, observable } from "mobx"
import { SelectionArray } from "../../selection/SelectionArray"
import { ColumnSlug } from "@ourworldindata/utils"

class PickerHolder extends React.Component<{ children: React.ReactNode }> {
    render(): React.ReactElement {
        return (
            <div
                style={{
                    padding: "20px",
                    height: "500px",
                    width: "300px",
                    display: "grid",
                }}
            >
                {this.props.children}
            </div>
        )
    }
}

const defaultSlugs = [
    OwidTableSlugs.entityName,
    SampleColumnSlugs.GDP,
    SampleColumnSlugs.Population,
]

// A stub class for testing
@observer
class SomeThingWithAPicker
    extends React.Component<{
        pickerSlugs?: ColumnSlug[]
        selection?: EntityName[]
    }>
    implements EntityPickerManager
{
    entityPickerTable = SynthesizeGDPTable({ entityCount: 30 }, 1)

    @observable entityPickerMetric?: ColumnSlug
    @observable entityPickerSort?: SortOrder

    @computed get pickerColumnSlugs(): string[] | undefined {
        return this.props.pickerSlugs
    }

    selection = new SelectionArray(
        this.props.selection ?? [],
        this.entityPickerTable.availableEntities
    )

    requiredColumnSlugs = defaultSlugs

    render(): React.ReactElement {
        return (
            <PickerHolder>
                <EntityPicker manager={this} />
            </PickerHolder>
        )
    }
}

export default {
    title: "EntityPicker",
    component: EntityPicker,
}

export const Empty = (): React.ReactElement => (
    <PickerHolder>
        <EntityPicker
            manager={{
                selection: new SelectionArray(),
            }}
        />
    </PickerHolder>
)

export const WithChoices = (): React.ReactElement => <SomeThingWithAPicker />

export const WithPickerMetricsChoices = (): React.ReactElement => (
    <SomeThingWithAPicker pickerSlugs={defaultSlugs} />
)

export const WithExistingSelectionChoices = (): React.ReactElement => (
    <SomeThingWithAPicker
        pickerSlugs={defaultSlugs}
        selection={["Japan", "Samoa"]}
    />
)
