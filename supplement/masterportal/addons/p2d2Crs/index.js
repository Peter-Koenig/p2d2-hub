// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Masterportal-Add-on p2d2Crs (Typ "tool"): Projektions-Switch
//
// Werkzeug im secondaryMenu, schaltet die 2D-Karte zwischen lokalem UTM-CRS
// und EPSG:3857 um (README, Abschnitt „Projektions-Switch“).

import P2d2Crs from "./components/P2d2Crs.vue";
import store from "./store/indexP2d2Crs.js";
import de from "./locales/de/additional.json";
import en from "./locales/en/additional.json";

export default {
    component: P2d2Crs,
    store,
    locales: {de, en}
};
