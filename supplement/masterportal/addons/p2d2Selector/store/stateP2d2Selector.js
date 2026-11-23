// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: State des Add-ons p2d2Selector (Auswahl von Kommune und Kategorie)
//
// Kein hasMouseMapInteractions: Das Werkzeug übernimmt keine Mausinteraktion,
// sonst sperrt die Klickprüfung des p2d2FeatureEditor die Editor-Klicks.
// layerStatus: idle | loading | ready | empty | error (Auswahl-Layer).

const state = {
    type: "p2d2Selector",
    name: "additional:modules.p2d2Selector.name",
    icon: "bi-grid-3x3-gap",
    selection: null,
    loadStatus: "idle",
    lastError: null,
    kommuneSlug: null,
    kategorieSlug: null,
    stage: null,
    stageStatus: "idle",
    stageError: null,
    appliedSignature: null,
    focusedSlug: null,
    layerStatus: "idle",
    featureCount: 0,
    layerError: null
};

export default state;
