/* ScatterData.ts
 * ================                                                             
 *
 * Compiles the dimensions associated with a chart into something cohesive and queryable
 *
 * @project Our World In Data
 * @author  Jaiden Mispy
 * @created 2017-03-09
 */

import * as _ from 'lodash'
import * as d3 from 'd3'
import ChartConfig from './ChartConfig'
import {computed, observable, extras} from 'mobx'

// [1990, 1, null]
// [1992, null, 2] ^
// [1995, 3, null]

export default class ScatterData {
    chart: ChartConfig

    constructor(chart: ChartConfig) { 
        this.chart = chart       
    }

    @computed get axisDimensions() {
        return _.filter(this.chart.dimensionsWithData, d => d.property == 'x' || d.property == 'y')
    }

    @computed get years(): number[] {
        if (!this.chart.timeline) {
            let maxYear = this.chart.timeRange[1]
            if (!_.isFinite(maxYear))
                maxYear = _(this.axisDimensions).map(d => _.max(d.variable.years)).max()
            return [maxYear]
        }

        // We use the axis variable with the lowest tolerance as the source of years to show
        const anchorDim = _.sortBy(this.axisDimensions, d => d.tolerance)[0]
        const anchorYears = _.uniq(anchorDim.variable.years)
        const otherDim = _.find(this.axisDimensions, d => d !== anchorDim)

        // Compute tolerance years
        const otherYearIndex = {}
        _(otherDim.variable.years).uniq().each(year => {
            for (var i = year-otherDim.tolerance; i <= year+otherDim.tolerance; i++) {
                otherYearIndex[i] = true
            }
        })

        const otherYears = _.chain(otherYearIndex).keys().map(d => parseInt(d)).value()

        return _.intersection(anchorYears, otherDim.variable.years)
    }

    @computed get colorScheme() : string[] {
        return [ // TODO less ad hoc color scheme (probably would have to annotate the datasets)
            "#5675c1", // Africa
            "#aec7e8", // Antarctica
            "#d14e5b", // Asia
            "#ffd336", // Europe
            "#4d824b", // North America
            "#a652ba", // Oceania
            "#69c487", // South America
            "#ff7f0e", "#1f77b4", "#ffbb78", "#2ca02c", "#98df8a", "#d62728", "#ff9896", "#9467bd", "#c5b0d5", "#8c564b", "c49c94", "e377c2", "f7b6d2", "7f7f7f", "c7c7c7", "bcbd22", "dbdb8d", "17becf", "9edae5", "1f77b4"]
    }

    @computed get colorScale(): d3.ScaleOrdinal<string, string> {
        const {colorScheme} = this
        const {dimensionsWithData} = this.chart

        const colorScale = d3.scaleOrdinal(this.colorScheme)

        var colorDim = _.find(dimensionsWithData, { property: 'color' });
        if (colorDim) {
            colorScale.domain(colorDim.variable.categoricalValues);
        }

        return colorScale
    }

    // Precompute the data transformation for every timeline year (so later animation is fast)
    @computed get dataByEntityAndYear() {
        const {years, colorScale} = this
        const {dimensionsWithData, xScaleType, yScaleType} = this.chart
        var dataByEntityAndYear = {};
    
        // The data values
        _.each(dimensionsWithData, (dimension) => {
            var variable = dimension.variable,
                tolerance = (dimension.property == 'color' || dimension.property == 'size') ? Infinity : dimension.tolerance;

            _.each(years, (outputYear) =>  {
                for (var i = 0; i < variable.years.length; i++) {
                    var year = variable.years[i],
                        value = variable.values[i],
                        entity = variable.entityKey[variable.entities[i]];

                    const targetYear = (!this.chart.timeline && _.isFinite(dimension.targetYear)) ? dimension.targetYear : outputYear

                    // Skip years that aren't within tolerance of the target
                    if (year < targetYear-tolerance || year > targetYear+tolerance)
                        continue;

                    // Skip values <= 0 for log scales
/*                    if (xScaleType == 'log' && dimension.property == 'x' && parseFloat(value) <= 0)
                        continue
                    else if (yScaleType == 'log' && dimension.property == 'y' && parseFloat(value) <= 0)
                        continue*/

                    var dataByYear = owid.default(dataByEntityAndYear, entity.id, {}),
                        series = owid.default(dataByYear, outputYear, {
                            id: entity.id,
                            label: entity.name,
                            key: entity.name,
                            values: [{ year: outputYear, time: {} }]
                        });

                    var d = series.values[0];

                    // Ensure we use the closest year to the target
                    var originYear = d.time[dimension.property];
                    if (_.isFinite(originYear) && Math.abs(originYear-targetYear) < Math.abs(year-targetYear))
                        continue;

                    if (dimension.property == 'color')
                        series.color = colorScale(value);
                    else {
                        d.time[dimension.property] = year;
                        d[dimension.property] = value;
                    }
                }
            });
        });

        // Exclude any with data for only one axis
        _.each(dataByEntityAndYear, function(v, k) {
            var newDataByYear = {};
            _.each(v, function(series, year) {
                var datum = series.values[0];
                if (_.has(datum, 'x') && _.has(datum, 'y'))
                    newDataByYear[year] = series;
            });
            dataByEntityAndYear[k] = newDataByYear;
        });

        return dataByEntityAndYear;
    }    
}