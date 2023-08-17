import React from "react"
import { computed, action } from "mobx"
import { observer } from "mobx-react"
import { SizeVariant } from "../core/GrapherConstants"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome/index.js"
import {
    faShareNodes,
    faExpand,
    faCompress,
    faDownload,
    faArrowRight,
    IconDefinition,
} from "@fortawesome/free-solid-svg-icons"
import { ShareMenu, ShareMenuManager } from "./ShareMenu"
import { DEFAULT_BOUNDS, Bounds } from "@ourworldindata/utils"

export interface ActionButtonsManager extends ShareMenuManager {
    isShareMenuActive?: boolean
    hideShareTabButton?: boolean
    hideExploreTheDataButton?: boolean
    isInIFrame?: boolean
    canonicalUrl?: string
    isInFullScreenMode?: boolean
    isDownloadModalOpen?: boolean
    sizeVariant?: SizeVariant
}

// keep in sync with sass variables in ActionButtons.scss
const BUTTON_HEIGHT = 32
const PADDING_BETWEEN_BUTTONS = 8
const PADDING_BETWEEN_ICON_AND_LABEL = 8
const PADDING_LEFT_RIGHT = 12

const BUTTON_WIDTH_ICON_ONLY = BUTTON_HEIGHT

@observer
export class ActionButtons extends React.Component<{
    manager: ActionButtonsManager
    maxWidth?: number
    availableWidth?: number
}> {
    @computed private get manager(): ActionButtonsManager {
        return this.props.manager
    }

    @computed protected get sizeVariant(): SizeVariant {
        return this.manager.sizeVariant ?? SizeVariant.lg
    }

    @computed protected get maxWidth(): number {
        return this.props.maxWidth ?? DEFAULT_BOUNDS.width
    }

    @computed protected get availableWidth(): number {
        return this.props.availableWidth ?? this.maxWidth
    }

    @computed get height(): number {
        return BUTTON_HEIGHT
    }

    @computed private get widthWithButtonLabels(): number {
        const {
            buttonCount,
            hasDownloadButton,
            hasShareButton,
            hasFullScreenButton,
            hasExploreTheDataButton,
            downloadButtonWithLabelWidth,
            shareButtonWithLabelWidth,
            fullScreenButtonWithLabelWidth,
            exploreTheDataButtonWithLabelWidth,
        } = this

        let width = 0
        if (hasDownloadButton) {
            width += downloadButtonWithLabelWidth
        }
        if (hasShareButton) {
            width += shareButtonWithLabelWidth
        }
        if (hasFullScreenButton) {
            width += fullScreenButtonWithLabelWidth
        }
        if (hasExploreTheDataButton) {
            width += exploreTheDataButtonWithLabelWidth
        }

        return width + (buttonCount - 1) * PADDING_BETWEEN_BUTTONS
    }

    @computed private get showButtonLabels(): boolean {
        const { availableWidth, sizeVariant, widthWithButtonLabels, maxWidth } =
            this
        if (sizeVariant !== SizeVariant.lg) return false
        if (widthWithButtonLabels <= availableWidth) return true
        return widthWithButtonLabels < 0.33 * maxWidth
    }

    @computed get width(): number {
        const {
            buttonCount,
            showButtonLabels,
            widthWithButtonLabels,
            hasExploreTheDataButton,
            exploreTheDataButtonWidth,
        } = this

        if (showButtonLabels) return widthWithButtonLabels

        if (hasExploreTheDataButton) {
            // the "Explore the data" label is always shown
            return (
                exploreTheDataButtonWidth +
                (buttonCount - 1) * BUTTON_WIDTH_ICON_ONLY +
                (buttonCount - 1) * PADDING_BETWEEN_BUTTONS
            )
        } else {
            return (
                buttonCount * BUTTON_WIDTH_ICON_ONLY +
                (buttonCount - 1) * PADDING_BETWEEN_BUTTONS
            )
        }
    }

    private static computeButtonWidth(label: string): number {
        const labelWidth = Bounds.forText(label, { fontSize: 13 }).width
        return (
            2 * PADDING_LEFT_RIGHT +
            13 + // icon width
            PADDING_BETWEEN_ICON_AND_LABEL +
            labelWidth
        )
    }

    @computed private get downloadButtonWithLabelWidth(): number {
        return ActionButtons.computeButtonWidth("Download")
    }

    @computed private get shareButtonWithLabelWidth(): number {
        return ActionButtons.computeButtonWidth("Share")
    }

    @computed private get fullScreenButtonLabel(): string {
        const { isInFullScreenMode } = this.manager
        return isInFullScreenMode ? "Exit full-screen" : "Enter full-screen"
    }

    @computed private get fullScreenButtonWithLabelWidth(): number {
        return ActionButtons.computeButtonWidth(this.fullScreenButtonLabel)
    }

    @computed private get exploreTheDataButtonWithLabelWidth(): number {
        return ActionButtons.computeButtonWidth("Explore the data")
    }

    @computed private get downloadButtonWidth(): number {
        const {
            hasDownloadButton,
            showButtonLabels,
            downloadButtonWithLabelWidth,
        } = this
        if (!hasDownloadButton) return 0
        if (!showButtonLabels) return BUTTON_WIDTH_ICON_ONLY
        return downloadButtonWithLabelWidth
    }

    @computed private get shareButtonWidth(): number {
        const { hasShareButton, showButtonLabels, shareButtonWithLabelWidth } =
            this
        if (!hasShareButton) return 0
        if (!showButtonLabels) return BUTTON_WIDTH_ICON_ONLY
        return shareButtonWithLabelWidth
    }

    @computed private get fullScreenButtonWidth(): number {
        const {
            hasFullScreenButton,
            showButtonLabels,
            fullScreenButtonWithLabelWidth,
        } = this
        if (!hasFullScreenButton) return 0
        if (!showButtonLabels) return BUTTON_WIDTH_ICON_ONLY
        return fullScreenButtonWithLabelWidth
    }

    // the "Explore the data" button is never shown without a label
    @computed private get exploreTheDataButtonWidth(): number {
        const { hasExploreTheDataButton, exploreTheDataButtonWithLabelWidth } =
            this
        if (!hasExploreTheDataButton) return 0
        return exploreTheDataButtonWithLabelWidth
    }

    @action.bound toggleShareMenu(): void {
        this.manager.isShareMenuActive = !this.manager.isShareMenuActive
    }

    @action.bound toggleFullScreenMode(): void {
        this.manager.isInFullScreenMode = !this.manager.isInFullScreenMode
    }

    @computed private get hasDownloadButton(): boolean {
        return true
    }

    @computed private get hasShareButton(): boolean {
        return !this.manager.hideShareTabButton
    }

    @computed private get hasFullScreenButton(): boolean {
        return !this.manager.isInIFrame
    }

    @computed private get hasExploreTheDataButton(): boolean {
        const { manager } = this
        return !manager.hideExploreTheDataButton || !!manager.isInIFrame
    }

    @computed private get buttonCount(): number {
        let count = 0
        if (this.hasDownloadButton) count += 1
        if (this.hasShareButton) count += 1
        if (this.hasFullScreenButton) count += 1
        if (this.hasExploreTheDataButton) count += 1
        return count
    }

    render(): JSX.Element {
        const { manager } = this
        const { isShareMenuActive } = manager

        const shareMenuElement = isShareMenuActive && (
            <ShareMenu manager={manager} onDismiss={this.toggleShareMenu} />
        )

        return (
            <div
                className="ActionButtons"
                style={{ height: this.height, width: this.width }}
            >
                <ul>
                    {this.hasDownloadButton && (
                        <ActionButton
                            width={this.downloadButtonWidth}
                            label="Download"
                            title="Download as .png or .svg"
                            dataTrackNote="chart_click_download"
                            showLabel={this.showButtonLabels}
                            icon={faDownload}
                            onClick={action(
                                () => (this.manager.isDownloadModalOpen = true)
                            )}
                        />
                    )}
                    {this.hasShareButton && (
                        <ActionButton
                            width={this.shareButtonWidth}
                            label="Share"
                            dataTrackNote="chart_click_share"
                            showLabel={this.showButtonLabels}
                            icon={faShareNodes}
                            onClick={this.toggleShareMenu}
                            isActive={this.manager.isShareMenuActive}
                        />
                    )}
                    {this.hasFullScreenButton && (
                        <ActionButton
                            width={this.fullScreenButtonWidth}
                            label={this.fullScreenButtonLabel}
                            dataTrackNote="chart_click_fullscreen"
                            showLabel={this.showButtonLabels}
                            icon={
                                manager.isInFullScreenMode
                                    ? faCompress
                                    : faExpand
                            }
                            onClick={this.toggleFullScreenMode}
                        />
                    )}
                    {this.hasExploreTheDataButton && (
                        <li
                            className="clickable explore-data"
                            style={{ width: this.exploreTheDataButtonWidth }}
                        >
                            <a
                                title="Explore the data"
                                data-track-note="chart_click_exploredata"
                                href={manager.canonicalUrl}
                                target="_blank"
                                rel="noopener"
                            >
                                <div className="label">Explore the data</div>
                                <FontAwesomeIcon icon={faArrowRight} />
                            </a>
                        </li>
                    )}
                </ul>
                {shareMenuElement}
            </div>
        )
    }
}

function ActionButton(props: {
    width: number
    dataTrackNote: string
    onClick: React.MouseEventHandler<HTMLButtonElement>
    showLabel: boolean
    label: string
    icon: IconDefinition
    title?: string
    isActive?: boolean
}): JSX.Element {
    return (
        <li
            className={
                "clickable" +
                (props.isActive ? " active" : "") +
                (props.showLabel ? "" : " icon-only")
            }
            style={{ width: props.width }}
        >
            <button
                title={props.title ?? props.label}
                data-track-note={props.dataTrackNote}
                onClick={props.onClick}
            >
                <FontAwesomeIcon icon={props.icon} />
                {props.showLabel && (
                    <span className="label">{props.label}</span>
                )}
            </button>
        </li>
    )
}