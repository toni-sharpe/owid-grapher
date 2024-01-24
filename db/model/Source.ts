import { Entity, PrimaryGeneratedColumn, Column, BaseEntity } from "typeorm"
import { Knex } from "knex"
import {
    SourcesRowEnriched,
    SourcesRowRaw,
    SourcesRowTableName,
    parseSourcesRow,
} from "@ourworldindata/types"

@Entity("sources")
export class Source extends BaseEntity {
    @PrimaryGeneratedColumn() id!: number
    @Column() datasetId!: number
    @Column() name!: string
    @Column({ default: "{}", type: "json" }) description!: any
}

export async function getSourceById(
    knex: Knex<any, any[]>,
    sourceId: number
): Promise<SourcesRowEnriched | undefined> {
    const rawSource = await knex<SourcesRowRaw>(SourcesRowTableName)
        .where({ id: sourceId })
        .first()
    if (!rawSource) return undefined
    const source = parseSourcesRow({
        ...rawSource,
        // for backwards compatibility
        description: rawSource.description ?? "{}",
    })
    return source
}

export async function getSourcesForDataset(
    knex: Knex<any, any[]>,
    datasetId: number
): Promise<SourcesRowEnriched[]> {
    const rawSources = await knex<SourcesRowRaw>(SourcesRowTableName).where({
        datasetId,
    })
    const sources = rawSources.map((rawSource) =>
        parseSourcesRow({
            ...rawSource,
            // for backwards compatibility
            description: rawSource.description ?? "{}",
        })
    )
    return sources
}

export async function sourceToDatapackage(
    source: SourcesRowEnriched
): Promise<any> {
    return Object.assign({}, { name: source.name }, source.description)
}
