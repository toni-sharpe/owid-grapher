import React from "react"
import { observer } from "mobx-react"
import {
    observable,
    computed,
    runInAction,
    autorun,
    action,
    reaction,
    IReactionDisposer,
} from "mobx"
import { Prompt, Redirect } from "react-router-dom"
import {
    Bounds,
    capitalize,
    RawPageview,
    DetailDictionary,
    get,
    set,
    groupBy,
    extractDetailsFromSyntax,
    getIndexableKeys,
} from "@ourworldindata/utils"
import {
    Topic,
    GrapherInterface,
    GrapherStaticFormat,
} from "@ourworldindata/types"
import { Grapher } from "@ourworldindata/grapher"
import { Admin } from "./Admin.js"
import {
    ChartEditor,
    EditorDatabase,
    Log,
    References,
    ChartRedirect,
    ChartEditorManager,
    Dataset,
    getFullReferencesCount,
    DetailReferences,
    FieldWithDetailReferences,
} from "./ChartEditor.js"
import { EditorBasicTab } from "./EditorBasicTab.js"
import { EditorDataTab } from "./EditorDataTab.js"
import { EditorTextTab } from "./EditorTextTab.js"
import { EditorCustomizeTab } from "./EditorCustomizeTab.js"
import { EditorScatterTab } from "./EditorScatterTab.js"
import { EditorMapTab } from "./EditorMapTab.js"
import { EditorHistoryTab } from "./EditorHistoryTab.js"
import { EditorReferencesTab } from "./EditorReferencesTab.js"
import { SaveButtons } from "./SaveButtons.js"
import { LoadingBlocker } from "./Forms.js"
import { AdminLayout } from "./AdminLayout.js"
import { AdminAppContext, AdminAppContextType } from "./AdminAppContext.js"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome/index.js"
import { faMobile, faDesktop } from "@fortawesome/free-solid-svg-icons"
import {
    VisionDeficiency,
    VisionDeficiencySvgFilters,
    VisionDeficiencyDropdown,
    VisionDeficiencyEntity,
} from "./VisionDeficiencies.js"
import { EditorMarimekkoTab } from "./EditorMarimekkoTab.js"
import { EditorExportTab } from "./EditorExportTab.js"
import { runDetailsOnDemand } from "../site/detailsOnDemand.js"

@observer
class TabBinder extends React.Component<{ editor: ChartEditor }> {
    dispose!: IReactionDisposer
    componentDidMount(): void {
        //window.addEventListener("hashchange", this.onHashChange)
        this.onHashChange()

        this.dispose = autorun(() => {
            //setTimeout(() => window.location.hash = `#${tab}-tab`, 100)
        })
    }

    componentWillUnmount(): void {
        //window.removeEventListener("hashchange", this.onHashChange)
        this.dispose()
    }

    render(): null {
        return null
    }

    @action.bound onHashChange(): void {
        const match = window.location.hash.match(/#(.+?)-tab/)
        if (match) {
            const tab = match[1]
            if (
                this.props.editor.grapher &&
                this.props.editor.availableTabs.includes(tab)
            )
                this.props.editor.tab = tab
        }
    }
}

@observer
export class ChartEditorPage
    extends React.Component<{
        grapherId?: number
        newGrapherIndex?: number
        grapherConfig?: any
    }>
    implements ChartEditorManager
{
    @observable.ref grapher = new Grapher()
    @observable.ref database = new EditorDatabase({})
    @observable logs: Log[] = []
    @observable references: References | undefined = undefined
    @observable redirects: ChartRedirect[] = []
    @observable pageviews?: RawPageview = undefined
    @observable allTopics: Topic[] = []
    @observable details: DetailDictionary = {}

    @observable.ref grapherElement?: JSX.Element

    static contextType = AdminAppContext
    context!: AdminAppContextType

    @observable simulateVisionDeficiency?: VisionDeficiency

    fetchedGrapherConfig?: any

    async fetchGrapher(): Promise<void> {
        const { grapherId } = this.props
        if (grapherId !== undefined) {
            this.fetchedGrapherConfig = await this.context.admin.getJSON(
                `/api/charts/${grapherId}.config.json`
            )
        }
        this.updateGrapher()
    }

    @observable private _isDbSet = false
    @observable private _isGrapherSet = false
    @computed get isReady(): boolean {
        return this._isDbSet && this._isGrapherSet
    }

    @action.bound private updateGrapher(): void {
        const config = this.fetchedGrapherConfig ?? this.props.grapherConfig
        const grapherConfig = {
            ...config,
            // binds the grapher instance to this.grapher
            getGrapherInstance: (grapher: Grapher) => {
                this.grapher = grapher
            },
            dataApiUrlForAdmin:
                this.context.admin.settings.DATA_API_FOR_ADMIN_UI, // passed this way because clientSettings are baked and need a recompile to be updated
            bounds: this.bounds,
            staticFormat: this.staticFormat,
        }
        this.grapher.renderToStatic = !!this.editor?.showStaticPreview
        this.grapherElement = <Grapher {...grapherConfig} />
        this._isGrapherSet = true
    }

    @action.bound private setDb(json: any): void {
        this.database = new EditorDatabase(json)
        this._isDbSet = true
    }

    async fetchData(): Promise<void> {
        const { admin } = this.context

        const [namespaces, variables] = await Promise.all([
            admin.getJSON(`/api/editorData/namespaces.json`),
            admin.getJSON(`/api/editorData/variables.json`),
        ])

        this.setDb(namespaces)

        const groupedByNamespace = groupBy(
            variables.datasets,
            (d) => d.namespace
        )
        for (const namespace in groupedByNamespace) {
            this.database.dataByNamespace.set(namespace, {
                datasets: groupedByNamespace[namespace] as Dataset[],
            })
        }
    }

    async fetchLogs(): Promise<void> {
        const { grapherId } = this.props
        const { admin } = this.context
        const json =
            grapherId === undefined
                ? {}
                : await admin.getJSON(`/api/charts/${grapherId}.logs.json`)
        runInAction(() => (this.logs = json.logs))
    }

    async fetchRefs(): Promise<void> {
        const { grapherId } = this.props
        const { admin } = this.context
        const json =
            grapherId === undefined
                ? {}
                : await admin.getJSON(
                      `/api/charts/${grapherId}.references.json`
                  )
        runInAction(() => (this.references = json.references))
    }

    async fetchRedirects(): Promise<void> {
        const { grapherId } = this.props
        const { admin } = this.context
        const json =
            grapherId === undefined
                ? {}
                : await admin.getJSON(`/api/charts/${grapherId}.redirects.json`)
        runInAction(() => (this.redirects = json.redirects))
    }

    async fetchPageviews(): Promise<void> {
        const { grapherId } = this.props
        const { admin } = this.context
        const json =
            grapherId === undefined
                ? {}
                : await admin.getJSON(`/api/charts/${grapherId}.pageviews.json`)
        runInAction(() => (this.pageviews = json.pageviews))
    }

    async fetchTopics(): Promise<void> {
        const { admin } = this.context
        const json = await admin.getJSON(`/api/topics.json`)
        runInAction(() => (this.allTopics = json.topics))
    }

    async fetchDetails(): Promise<void> {
        await runDetailsOnDemand()

        runInAction(() => {
            if (window.details) this.details = window.details
        })
    }

    @computed private get isMobilePreview(): boolean {
        return this.editor?.previewMode === "mobile"
    }

    @computed private get bounds(): Bounds {
        return this.isMobilePreview
            ? new Bounds(0, 0, 380, 525)
            : this.grapher.idealBounds
    }

    @computed private get staticFormat(): GrapherStaticFormat {
        return this.isMobilePreview
            ? GrapherStaticFormat.square
            : GrapherStaticFormat.landscape
    }

    // unvalidated terms extracted from the subtitle and note fields
    // these may point to non-existent details e.g. ["not_a_real_term", "pvotery"]
    @computed
    get currentDetailReferences(): DetailReferences {
        return {
            subtitle: extractDetailsFromSyntax(this.grapher.currentSubtitle),
            note: extractDetailsFromSyntax(this.grapher.note),
            axisLabelX: extractDetailsFromSyntax(
                this.grapher.xAxisConfig.label ?? ""
            ),
            axisLabelY: extractDetailsFromSyntax(
                this.grapher.yAxisConfig.label ?? ""
            ),
        }
    }

    // the actual Detail objects, indexed by category.term
    @computed get currentlyReferencedDetails(): GrapherInterface["details"] {
        const grapherConfigDetails: GrapherInterface["details"] = {}
        const allReferences = Object.values(this.currentDetailReferences).flat()

        allReferences.forEach((term) => {
            const detail = get(this.details, term)
            if (detail) {
                set(grapherConfigDetails, term, detail)
            }
        })

        return grapherConfigDetails
    }

    @computed
    get invalidDetailReferences(): ChartEditorManager["invalidDetailReferences"] {
        const { currentDetailReferences } = this
        const keys = getIndexableKeys(currentDetailReferences)

        const invalidDetailReferences = Object.fromEntries(
            keys.map((key: FieldWithDetailReferences) => [
                key,
                currentDetailReferences[key].filter(
                    (term: string) => !this.details[term]
                ),
            ])
        ) as DetailReferences

        return invalidDetailReferences
    }

    @computed get errorMessages(): ChartEditorManager["errorMessages"] {
        const { invalidDetailReferences } = this
        const keys = getIndexableKeys(invalidDetailReferences)

        const errorMessages: ChartEditorManager["errorMessages"] = {}

        keys.forEach((key: FieldWithDetailReferences) => {
            const references = invalidDetailReferences[key]
            if (references.length) {
                errorMessages[
                    key
                ] = `Invalid detail(s) specified: ${references.join(", ")}`
            }
        })

        return errorMessages
    }

    @computed get admin(): Admin {
        return this.context.admin
    }

    @computed get editor(): ChartEditor | undefined {
        if (!this.isReady) return undefined

        return new ChartEditor({ manager: this })
    }

    @action.bound refresh(): void {
        this.fetchGrapher()
        this.fetchDetails()
        this.fetchData()
        this.fetchLogs()
        this.fetchRefs()
        this.fetchRedirects()
        this.fetchPageviews()
        this.fetchTopics()
    }

    disposers: IReactionDisposer[] = []

    componentDidMount(): void {
        this.refresh()

        this.disposers.push(
            reaction(
                () => this.editor && this.editor.previewMode,
                () => {
                    if (this.editor) {
                        localStorage.setItem(
                            "editorPreviewMode",
                            this.editor.previewMode
                        )
                    }
                    this.updateGrapher()
                }
            )
        )
    }

    // This funny construction allows the "new chart" link to work by forcing an update
    // even if the props don't change
    UNSAFE_componentWillReceiveProps(): void {
        setTimeout(() => this.refresh(), 0)
    }

    componentWillUnmount(): void {
        this.disposers.forEach((dispose) => dispose())
    }

    render(): JSX.Element {
        return (
            <AdminLayout noSidebar>
                <main className="ChartEditorPage">
                    {(this.editor === undefined ||
                        this.editor.currentRequest) && <LoadingBlocker />}
                    {this.editor !== undefined && this.renderReady(this.editor)}
                </main>
            </AdminLayout>
        )
    }

    renderReady(editor: ChartEditor): JSX.Element {
        const { grapher, availableTabs } = editor

        return (
            <React.Fragment>
                {!editor.newChartId && (
                    <Prompt
                        when={editor.isModified}
                        message="Are you sure you want to leave? Unsaved changes will be lost."
                    />
                )}
                {editor.newChartId && (
                    <Redirect to={`/charts/${editor.newChartId}/edit`} />
                )}
                <TabBinder editor={editor} />
                <div className="chart-editor-settings">
                    <div className="p-2">
                        <ul className="nav nav-tabs">
                            {availableTabs.map((tab) => (
                                <li key={tab} className="nav-item">
                                    <a
                                        className={
                                            "nav-link" +
                                            (tab === editor.tab
                                                ? " active"
                                                : "")
                                        }
                                        onClick={() => {
                                            editor.tab = tab
                                            editor.showStaticPreview =
                                                tab === "export"
                                            this.updateGrapher()
                                        }}
                                    >
                                        {capitalize(tab)}
                                        {tab === "refs" && this.references
                                            ? ` (${getFullReferencesCount(
                                                  this.references
                                              )})`
                                            : ""}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="innerForm container">
                        {editor.tab === "basic" && (
                            <EditorBasicTab editor={editor} />
                        )}
                        {editor.tab === "text" && (
                            <EditorTextTab editor={editor} />
                        )}
                        {editor.tab === "data" && (
                            <EditorDataTab editor={editor} />
                        )}
                        {editor.tab === "customize" && (
                            <EditorCustomizeTab editor={editor} />
                        )}
                        {editor.tab === "scatter" && (
                            <EditorScatterTab grapher={grapher} />
                        )}
                        {editor.tab === "marimekko" && (
                            <EditorMarimekkoTab grapher={grapher} />
                        )}
                        {editor.tab === "map" && (
                            <EditorMapTab editor={editor} />
                        )}
                        {editor.tab === "revisions" && (
                            <EditorHistoryTab editor={editor} />
                        )}
                        {editor.tab === "refs" && (
                            <EditorReferencesTab editor={editor} />
                        )}
                        {editor.tab === "export" && (
                            <EditorExportTab editor={editor} />
                        )}
                    </div>
                    {editor.tab !== "export" && <SaveButtons editor={editor} />}
                </div>
                <div className="chart-editor-view">
                    <figure
                        data-grapher-src
                        style={{
                            minHeight: this.editor?.showStaticPreview
                                ? this.grapher.staticBoundsWithDetails.height
                                : undefined,
                            boxShadow: this.editor?.showStaticPreview
                                ? "0px 4px 40px rgba(0, 0, 0, 0.2)"
                                : undefined,
                            filter:
                                this.simulateVisionDeficiency &&
                                `url(#${this.simulateVisionDeficiency.id})`,
                        }}
                    >
                        {this.grapherElement}
                    </figure>
                    <div>
                        <div
                            className="btn-group"
                            data-toggle="buttons"
                            style={{ whiteSpace: "nowrap" }}
                        >
                            <label
                                className={
                                    "btn btn-light" +
                                    (this.isMobilePreview ? " active" : "")
                                }
                                title="Mobile preview"
                            >
                                <input
                                    type="radio"
                                    onChange={action(() => {
                                        editor.previewMode = "mobile"
                                    })}
                                    name="previewSize"
                                    id="mobile"
                                    checked={this.isMobilePreview}
                                />{" "}
                                <FontAwesomeIcon icon={faMobile} />
                            </label>
                            <label
                                className={
                                    "btn btn-light" +
                                    (!this.isMobilePreview ? " active" : "")
                                }
                                title="Desktop preview"
                            >
                                <input
                                    onChange={action(() => {
                                        editor.previewMode = "desktop"
                                    })}
                                    type="radio"
                                    name="previewSize"
                                    id="desktop"
                                    checked={!this.isMobilePreview}
                                />{" "}
                                <FontAwesomeIcon icon={faDesktop} />
                            </label>
                        </div>
                        <div
                            className="form-group d-inline-block"
                            style={{ width: 250, marginLeft: 15 }}
                        >
                            Emulate vision deficiency:{" "}
                            <VisionDeficiencyDropdown
                                onChange={action(
                                    (option: VisionDeficiencyEntity) =>
                                        (this.simulateVisionDeficiency =
                                            option.deficiency)
                                )}
                            />
                        </div>
                    </div>

                    {/* Include svg filters necessary for vision deficiency emulation */}
                    <VisionDeficiencySvgFilters />
                </div>
            </React.Fragment>
        )
    }
}
