import * as db from "../db/db.js"
import { syncDatasetToGitRepo } from "./gitDataExport.js"
import { DatasetsRow, DatasetsRowTableName } from "@ourworldindata/types"

const main = async () => {
    const knex = db.knexInstance()
    const datasets = await knex<DatasetsRow>(DatasetsRowTableName).where({
        namespace: "owid",
    })
    for (const dataset of datasets) {
        if (!dataset.isPrivate && !dataset.nonRedistributable)
            await syncDatasetToGitRepo(knex, dataset.id, { commitOnly: true })
    }
}

main()
