import { faMinus, faPlus } from "@fortawesome/free-solid-svg-icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome/index.js"
import {
    LogoOption,
    RelatedQuestionsConfig,
    Topic,
} from "@ourworldindata/types"
import {
    Grapher,
    getErrorMessageRelatedQuestionUrl,
} from "@ourworldindata/grapher"
import { slugify } from "@ourworldindata/utils"
import { action, computed, runInAction } from "mobx"
import { observer } from "mobx-react"
import React from "react"
import Select from "react-select"
import { TOPICS_CONTENT_GRAPH } from "../settings/clientSettings.js"
import { ChartEditor } from "./ChartEditor.js"
import {
    AutoTextField,
    BindAutoString,
    BindAutoStringExt,
    BindString,
    Button,
    RadioGroup,
    Section,
    TextField,
    Toggle,
} from "./Forms.js"

@observer
export class EditorTextTab extends React.Component<{ editor: ChartEditor }> {
    @action.bound onSlug(slug: string) {
        this.props.editor.grapher.slug = slugify(slug)
    }

    @action.bound onChangeLogo(value: string) {
        if (value === "none") {
            this.props.editor.grapher.hideLogo = true
        } else {
            this.props.editor.grapher.hideLogo = undefined
            this.props.editor.grapher.logo = (value as LogoOption) || undefined
        }
    }

    @action.bound onAddRelatedQuestion() {
        const { grapher } = this.props.editor
        grapher.relatedQuestions.push({
            text: "",
            url: "",
        })
    }

    @action.bound onRemoveRelatedQuestion(idx: number) {
        const { grapher } = this.props.editor
        grapher.relatedQuestions.splice(idx, 1)
    }

    @action.bound onToggleTitleAnnotationEntity(value: boolean) {
        const { grapher } = this.props.editor
        grapher.hideAnnotationFieldsInTitle ??= {}
        grapher.hideAnnotationFieldsInTitle.entity = value || undefined
    }

    @action.bound onToggleTitleAnnotationTime(value: boolean) {
        const { grapher } = this.props.editor
        grapher.hideAnnotationFieldsInTitle ??= {}
        grapher.hideAnnotationFieldsInTitle.time = value || undefined
    }

    @action.bound onToggleTitleAnnotationChangeInPrefix(value: boolean) {
        const { grapher } = this.props.editor
        grapher.hideAnnotationFieldsInTitle ??= {}
        grapher.hideAnnotationFieldsInTitle.changeInPrefix = value || undefined
    }

    @computed get errorMessages() {
        return this.props.editor.manager.errorMessages
    }

    @computed get showAnyAnnotationFieldInTitleToggle() {
        const { features } = this.props.editor
        return (
            features.showEntityAnnotationInTitleToggle ||
            features.showTimeAnnotationInTitleToggle ||
            features.showChangeInPrefixToggle
        )
    }

    render() {
        const { grapher, references, features } = this.props.editor
        const { relatedQuestions } = grapher

        return (
            <div className="EditorTextTab">
                <Section name="Header">
                    <BindAutoString
                        field="title"
                        store={grapher}
                        auto={grapher.displayTitle}
                        softCharacterLimit={100}
                    />
                    {features.showEntityAnnotationInTitleToggle && (
                        <Toggle
                            label="Hide automatic entity"
                            value={
                                !!grapher.hideAnnotationFieldsInTitle?.entity
                            }
                            onValue={this.onToggleTitleAnnotationEntity}
                        />
                    )}
                    {features.showTimeAnnotationInTitleToggle && (
                        <Toggle
                            label="Hide automatic time"
                            secondaryLabel={
                                "Grapher makes sure to include the current time in the title if " +
                                "omitting it would lead to SVG exports with no reference " +
                                "to the time. In such cases, your preference is ignored."
                            }
                            value={!!grapher.hideAnnotationFieldsInTitle?.time}
                            onValue={this.onToggleTitleAnnotationTime}
                        />
                    )}
                    {features.showChangeInPrefixToggle && (
                        <Toggle
                            label="Don't prepend 'Change in' in relative line charts"
                            value={
                                !!grapher.hideAnnotationFieldsInTitle
                                    ?.changeInPrefix
                            }
                            onValue={this.onToggleTitleAnnotationChangeInPrefix}
                        />
                    )}
                    {this.showAnyAnnotationFieldInTitleToggle && <hr />}
                    <AutoTextField
                        label="/grapher"
                        value={grapher.displaySlug}
                        onValue={this.onSlug}
                        isAuto={grapher.slug === undefined}
                        onToggleAuto={() =>
                            (grapher.slug =
                                grapher.slug === undefined
                                    ? grapher.displaySlug
                                    : undefined)
                        }
                        helpText="Human-friendly URL for this chart"
                    />
                    <BindAutoStringExt
                        label={"Subtitle"}
                        readFn={(g) => g.currentSubtitle}
                        writeFn={(g, newVal) => (g.subtitle = newVal)}
                        isAuto={grapher.subtitle === undefined}
                        store={grapher}
                        placeholder="Briefly describe the context of the data. It's best to avoid duplicating any information which can be easily inferred from other visual elements of the chart."
                        textarea
                        softCharacterLimit={280}
                        errorMessage={this.errorMessages.subtitle}
                    />
                    <RadioGroup
                        label="Logo"
                        options={[
                            { label: "OWID", value: "owid" },
                            { label: "CORE+OWID", value: "core+owid" },
                            { label: "GV+OWID", value: "gv+owid" },
                            { label: "No logo", value: "none" },
                        ]}
                        value={
                            grapher.hideLogo ? "none" : grapher.logo || "owid"
                        }
                        onChange={this.onChangeLogo}
                    />
                </Section>
                <Section name="Footer">
                    <BindAutoString
                        label="Source"
                        field="sourceDesc"
                        store={grapher}
                        auto={grapher.sourcesLine}
                        helpText="Short comma-separated list of source names"
                        softCharacterLimit={60}
                    />
                    <BindString
                        label="Origin url"
                        field="originUrl"
                        store={grapher}
                        placeholder={grapher.originUrlWithProtocol}
                        helpText="The page containing this chart where more context can be found"
                    />
                    {references &&
                        (references.postsWordpress.length > 0 ||
                            references.postsGdocs.length > 0) && (
                            <div className="originSuggestions">
                                <p>Origin url suggestions</p>
                                <ul>
                                    {[
                                        ...references.postsWordpress,
                                        ...references.postsGdocs,
                                    ].map((post) => (
                                        <li key={post.id}>{post.url}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                    <BindString
                        label="Footer note"
                        field="note"
                        store={grapher}
                        helpText="Any important clarification needed to avoid miscommunication"
                        softCharacterLimit={140}
                        errorMessage={this.errorMessages.note}
                        textarea
                    />
                </Section>

                <TopicsSection
                    allTopics={this.props.editor.allTopics}
                    grapher={grapher}
                />

                <Section name="Related">
                    {relatedQuestions.map(
                        (question: RelatedQuestionsConfig, idx: number) => (
                            <div key={idx}>
                                <TextField
                                    label="Related question"
                                    value={question.text}
                                    onValue={action((value: string) => {
                                        question.text = value
                                    })}
                                    placeholder="e.g. How did countries respond to the pandemic?"
                                    helpText="Short question promoting exploration of related content"
                                    softCharacterLimit={50}
                                />
                                {question.text && (
                                    <TextField
                                        label="URL"
                                        value={question.url}
                                        onValue={action((value: string) => {
                                            question.url = value
                                        })}
                                        placeholder="e.g. https://ourworldindata.org/coronavirus"
                                        helpText="Page or section of a page where the answer to the previous question can be found."
                                        errorMessage={getErrorMessageRelatedQuestionUrl(
                                            question
                                        )}
                                    />
                                )}
                                <Button
                                    onClick={() =>
                                        this.onRemoveRelatedQuestion(idx)
                                    }
                                >
                                    <FontAwesomeIcon icon={faMinus} /> Remove
                                    related question
                                </Button>
                            </div>
                        )
                    )}
                    {!relatedQuestions.length && (
                        <Button onClick={this.onAddRelatedQuestion}>
                            <FontAwesomeIcon icon={faPlus} /> Add related
                            question
                        </Button>
                    )}
                </Section>
                <Section name="Misc">
                    <BindString
                        label="Internal author notes"
                        field="internalNotes"
                        store={grapher}
                        placeholder="e.g. WIP, needs review, etc"
                        textarea
                    />
                    <BindString
                        label="Variant name"
                        field="variantName"
                        store={grapher}
                        placeholder="e.g. IHME"
                        helpText="Optional variant name for distinguishing charts with the same title"
                    />
                </Section>
            </div>
        )
    }
}
@observer
class TopicsSection extends React.Component<{
    allTopics: Topic[]
    grapher: Grapher
}> {
    render() {
        const { grapher } = this.props

        return (
            <Section name="Topics">
                <Select
                    isDisabled={!TOPICS_CONTENT_GRAPH}
                    options={this.props.allTopics}
                    getOptionValue={(topic) => topic.id.toString()}
                    getOptionLabel={(topic) => topic.name}
                    isMulti={true}
                    value={grapher.topicIds.map((topicId) => ({
                        id: topicId,
                        name:
                            this.props.allTopics.find((t) => t.id === topicId)
                                ?.name || "TOPIC NOT FOUND",
                    }))}
                    onChange={(topics) =>
                        runInAction(() => {
                            grapher.topicIds = topics.map((topic) => topic.id)
                        })
                    }
                    menuPlacement="auto"
                />
            </Section>
        )
    }
}
