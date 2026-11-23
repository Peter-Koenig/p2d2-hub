// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Mutationen des Add-ons p2d2Selector

export default {
    setSelection (state, selection) {
        state.selection = selection;
    },
    setLoadStatus (state, status) {
        state.loadStatus = status;
    },
    setLastError (state, message) {
        state.lastError = message;
    },
    setSelected (state, {kommuneSlug, kategorieSlug}) {
        state.kommuneSlug = kommuneSlug;
        state.kategorieSlug = kategorieSlug;
    },
    setStage (state, {stage, status, error}) {
        state.stage = stage;
        state.stageStatus = status;
        state.stageError = error;
    },
    setAppliedSignature (state, signature) {
        state.appliedSignature = signature;
    },
    setFocusedSlug (state, slug) {
        state.focusedSlug = slug;
    },
    setLayerStatus (state, {status, count = 0, error = null}) {
        state.layerStatus = status;
        state.featureCount = count;
        state.layerError = error;
    }
};
