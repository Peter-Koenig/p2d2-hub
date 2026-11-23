// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: State des Add-ons p2d2Crs (Projektions-Switch)
//
// Kein hasMouseMapInteractions: Das Werkzeug übernimmt keine Mausinteraktion,
// sonst sperrt die Klickprüfung des p2d2FeatureEditor die Editor-Klicks
// (Menu/currentMouseMapInteractionsComponent muss "getFeatureInfo" bleiben).
// localCrs ist der Default ohne gewählte Kommune; setLocalCrs ändert ihn.

const state = {
    type: "p2d2Crs",
    name: "additional:modules.p2d2Crs.name",
    icon: "bi-globe2",
    localCrs: "EPSG:25832",
    genericCrs: "EPSG:3857",
    activeCrs: "EPSG:25832",
    lastError: null
};

export default state;
