import {
    BASE_FONT_SIZE,
    FacetAxisRange,
    ScaleType,
} from "../core/GrapherConstants"
import { extend, trimObject } from "../../clientUtils/Util"
import { observable, computed } from "mobx"
import { HorizontalAxis, VerticalAxis } from "./Axis"
import {
    deleteRuntimeAndUnchangedProps,
    Persistable,
} from "../persistable/Persistable"
import { AxisConfigInterface } from "./AxisConfigInterface"
import { ScaleSelectorManager } from "../controls/ScaleSelector"

export interface FontSizeManager {
    fontSize: number
}

class AxisConfigDefaults implements AxisConfigInterface {
    @observable.ref min?: number = undefined
    @observable.ref max?: number = undefined
    @observable.ref scaleType?: ScaleType = ScaleType.linear
    @observable.ref canChangeScaleType?: boolean = undefined
    @observable label: string = ""
    @observable.ref removePointsOutsideDomain?: boolean = undefined
    @observable.ref minSize?: number = undefined
    @observable.ref hideAxis: boolean = false
    @observable.ref labelPadding: number = 5
    @observable.ref facetAxisRange: FacetAxisRange = FacetAxisRange.shared
    @observable.ref nice: boolean = false
    @observable.ref maxTicks: number = 6
    @observable.ref compactLabels: boolean = false
}

export class AxisConfig
    extends AxisConfigDefaults
    implements AxisConfigInterface, Persistable, ScaleSelectorManager {
    constructor(
        props?: AxisConfigInterface,
        fontSizeManager?: FontSizeManager
    ) {
        super()
        this.updateFromObject(props)
        this.fontSizeManager = fontSizeManager
    }

    private fontSizeManager?: FontSizeManager

    // todo: test/refactor
    updateFromObject(props?: AxisConfigInterface): void {
        if (props) extend(this, props)
    }

    toObject(): AxisConfigInterface {
        const obj = trimObject({
            scaleType: this.scaleType,
            label: this.label ? this.label : undefined,
            min: this.min,
            max: this.max,
            canChangeScaleType: this.canChangeScaleType,
            removePointsOutsideDomain: this.removePointsOutsideDomain,
            facetAxisRange: this.facetAxisRange,
            minSize: this.minSize,
            hideAxis: this.hideAxis,
            labelPadding: this.labelPadding,
            nice: this.nice,
            maxTicks: this.maxTicks,
            compactLabels: this.compactLabels,
        })

        deleteRuntimeAndUnchangedProps(obj, new AxisConfigDefaults())

        return obj
    }

    @computed get fontSize(): number {
        return this.fontSizeManager?.fontSize || BASE_FONT_SIZE
    }

    // A log scale domain cannot have values <= 0, so we double check here
    @computed private get constrainedMin(): number {
        if (this.scaleType === ScaleType.log && (this.min ?? 0) <= 0)
            return Infinity
        return this.min ?? Infinity
    }

    // If the author has specified a min/max AND to remove points outside the domain, this should return true
    shouldRemovePoint(value: number): boolean {
        if (!this.removePointsOutsideDomain) return false
        if (this.min !== undefined && value < this.min) return true
        if (this.max !== undefined && value > this.max) return true
        return false
    }

    @computed private get constrainedMax(): number {
        if (this.scaleType === ScaleType.log && (this.max || 0) <= 0)
            return -Infinity
        return this.max ?? -Infinity
    }

    @computed get domain(): [number, number] {
        return [this.constrainedMin, this.constrainedMax]
    }

    // Convert axis configuration to a finalized axis spec by supplying
    // any needed information calculated from the data
    toHorizontalAxis(): HorizontalAxis {
        return new HorizontalAxis(this)
    }

    toVerticalAxis(): VerticalAxis {
        return new VerticalAxis(this)
    }
}
