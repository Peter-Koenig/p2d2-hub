// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Getter des Add-ons p2d2Selector

import {findKategorie, findKommune, selectionSignature} from "../js/selection.js";

export default {
    type: state => state.type,
    name: state => state.name,
    icon: state => state.icon,
    selection: state => state.selection,
    loadStatus: state => state.loadStatus,
    lastError: state => state.lastError,
    kommuneSlug: state => state.kommuneSlug,
    kategorieSlug: state => state.kategorieSlug,
    signature: state => selectionSignature(state),
    selectedKommune: state => findKommune(state.selection, state.kommuneSlug),
    selectedKategorie: state => findKategorie(state.selection, state.kategorieSlug),
    stageStatus: state => state.stageStatus,
    stageError: state => state.stageError,
    layerStatus: state => state.layerStatus,
    featureCount: state => state.featureCount,
    layerError: state => state.layerError
};
