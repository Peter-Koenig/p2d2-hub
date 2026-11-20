// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Laufzeit-Abhängigkeiten des Add-ons p2d2Crs im Masterportal
//
// Einzige Datei des Add-ons mit Masterportal-Importen. proj4 und ol sind im
// Masterportal nur transitiv vorhanden (über masterportalapi) und werden per
// Vite-dedupe auf eine Instanz gelegt (devtools/vite.config.js).

import crs from "@masterportal/masterportalapi/src/crs.js";
import View from "ol/View.js";
import {get as getProjection} from "ol/proj.js";
import {createEnsureProjection} from "./utm.js";
import {swapView} from "./viewSwap.js";

const ensureProjection = createEnsureProjection({
    hasDefinition: code => Boolean(crs.getProjection(code)),
    getProjection,
    registerProjections: list => crs.registerProjections(list)
});

export default {
    swapView,
    View,
    ensureProjection,
    getMap: () => window.mapCollection.getMap("2D"),
    baseExtent: rootGetters => {
        const {extent, epsg} = rootGetters.mapViewSettings ?? {};

        return Array.isArray(extent) && epsg ? {extent, epsg} : undefined;
    }
};
