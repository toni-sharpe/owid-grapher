import * as db from "../db/db.js"
import { syncDatasetToGitRepo } from "./gitDataExport.js"
import { DbPlainDataset, DbPlainDatasetTableName } from "@ourworldindata/types"

const main = async () => {
    const knex = db.knexInstance()
    const datasets = await knex<DbPlainDataset>(DbPlainDatasetTableName).where({
        namespace: "owid",
    })
    for (const dataset of datasets) {
        if (!dataset.isPrivate && !dataset.nonRedistributable)
            await syncDatasetToGitRepo(knex, dataset.id, { commitOnly: true })
    }
}

main()
