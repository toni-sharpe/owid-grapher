#! /usr/bin/env jest

import { ColumnTypeNames } from "@ourworldindata/types"
import { OwidTable } from "@ourworldindata/core-table"
import { DownloadModal } from "./DownloadModal"

const getTable = (options: { nonRedistributable: boolean }): OwidTable => {
    return new OwidTable(
        [
            ["entityName", "year", "x", "y"],
            ["usa", 1998, 1, 1],
            ["uk", 1999, 0, 0],
            ["uk", 2000, 0, 0],
            ["uk", 2001, 0, 0],
            ["usa", 2002, 2, 2],
        ],
        [
            {
                slug: "x",
                type: ColumnTypeNames.Numeric,
                tolerance: 1,
                nonRedistributable: options.nonRedistributable,
            },
            {
                slug: "y",
                type: ColumnTypeNames.Numeric,
                tolerance: 1,
            },
        ]
    )
}

it("correctly passes non-redistributable flag", () => {
    const tableFalse = getTable({ nonRedistributable: false })
    const viewFalse = new DownloadModal({
        manager: {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            rasterize: () => new Promise(() => {}),
            displaySlug: "",
            table: tableFalse,
        },
    })
    expect(viewFalse["nonRedistributable"]).toBeFalsy()

    const tableTrue = getTable({ nonRedistributable: true })
    const viewTrue = new DownloadModal({
        manager: {
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            rasterize: () => new Promise(() => {}),
            displaySlug: "",
            table: tableTrue,
        },
    })
    expect(viewTrue["nonRedistributable"]).toBeTruthy()
})
