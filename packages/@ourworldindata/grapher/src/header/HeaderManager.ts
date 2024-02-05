import { Bounds } from "@ourworldindata/utils"
import { DetailsMarker } from "@ourworldindata/types"

export interface HeaderManager {
    currentTitle?: string
    currentSubtitle?: string
    hideLogo?: boolean
    shouldLinkToOwid?: boolean
    logo?: string
    canonicalUrl?: string
    tabBounds?: Bounds
    detailsOrderedByReference?: Set<string>
    shouldIncludeDetailsInStaticExport?: boolean
    isExportingToSvgOrPng?: boolean
    isNarrow?: boolean
    isSmall?: boolean
    isMedium?: boolean
    framePaddingHorizontal?: number
    framePaddingVertical?: number
    isOnCanonicalUrl?: boolean
    isInIFrame?: boolean
    useBaseFontSize?: boolean
    fontSize?: number
    hideTitle?: boolean
    hideSubtitle?: boolean
    secondaryColorInStaticCharts?: string
    isStaticAndSmall?: boolean
    detailsMarkerInSvg?: DetailsMarker
}
