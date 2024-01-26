import { Entity, Column } from "typeorm"
import {
    OwidGdocErrorMessage,
    OwidGdocHomepageContent,
    OwidGdocHomepageInterface,
    OwidGdocMinimalPostInterface,
} from "@ourworldindata/utils"
import { GdocBase } from "./GdocBase.js"
import * as db from "../../db.js"
import { OwidGdocHomepageMetadata } from "@ourworldindata/types"

@Entity("posts_gdocs")
export class GdocHomepage
    extends GdocBase
    implements OwidGdocHomepageInterface
{
    @Column({ default: "{}", type: "json" })
    content!: OwidGdocHomepageContent

    constructor(id?: string) {
        super()
        if (id) {
            this.id = id
        }
    }

    linkedDocuments: Record<string, OwidGdocMinimalPostInterface> = {}
    homepageMetadata: OwidGdocHomepageMetadata = {}
    _urlProperties: string[] = []

    _validateSubclass = async (): Promise<OwidGdocErrorMessage[]> => {
        const errors: OwidGdocErrorMessage[] = []
        return errors
    }

    _loadSubclassAttachments = async (): Promise<void> => {
        const totalNumberOfCharts = await db
            .queryMysql(
                `
            SELECT COUNT(*) AS count
            FROM charts
            WHERE publishedAt IS NOT NULL`
            )
            .then((res) => res[0].count)

        const totalNumberOfTopics = await db
            .queryMysql(
                `
            SELECT COUNT(DISTINCT(tagId)) AS count
            FROM chart_tags
            WHERE chartId IN (
            SELECT id
            FROM charts
            WHERE publishedAt IS NOT NULL)`
            )
            .then((res) => res[0].count)

        this.homepageMetadata = {
            chartCount: totalNumberOfCharts,
            topicCount: totalNumberOfTopics,
        }
    }
}
