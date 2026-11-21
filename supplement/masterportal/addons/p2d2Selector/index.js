// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Masterportal-Add-on p2d2Selector (Typ "tool"): Auswahl von Kommune und Kategorie
//
// Werkzeug im mainMenu mit zwei Kachelmatrizen wie auf der Standalone-Startseite.
// Die Auswahl liegt im Store; Karte, Layer und Zoom folgen in späteren Stufen
// über den Hook runtime.applySelection.

import P2d2Selector from "./components/P2d2Selector.vue";
import store from "./store/indexP2d2Selector.js";
import de from "./locales/de/additional.json";
import en from "./locales/en/additional.json";

export default {
    component: P2d2Selector,
    store,
    locales: {de, en}
};
