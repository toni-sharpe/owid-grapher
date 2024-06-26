/** the entity in the `tags` table */
export const TagsGraphTableName = "tag_graph"
export interface DbInsertTagGraph {
    parentId: number
    childId: number
    weight?: number
}
export type DbPlainTag = Required<DbInsertTagGraph>
