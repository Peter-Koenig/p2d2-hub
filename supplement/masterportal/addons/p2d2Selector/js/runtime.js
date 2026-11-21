// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Laufzeit-Abhängigkeiten des Add-ons p2d2Selector im Masterportal
//
// Einzige Datei des Add-ons mit Zugriff auf Masterportal, Karte und
// OpenLayers. ol ist im Masterportal nur transitiv vorhanden (über
// masterportalapi) und per Vite-dedupe eine Instanz (wie im Add-on p2d2Crs).
// Pfade sind relativ zur Portal-Seite, wie portalConf und layerConf in config.js.

import GeoJSON from "ol/format/GeoJSON.js";
import {transform} from "ol/proj.js";
import {createDebug, debugEnabled} from "./debug.js";

const format = new GeoJSON();

/**
 * Debug-Schalter aus der Portal-URL.
 * @returns {boolean} true bei ?p2d2debug=1.
 */
function readDebugFlag () {
    try {
        return debugEnabled(window.location.search);
    }
    catch {
        return false;
    }
}

export default {
    url: "./resources/p2d2-selection.json",
    stageUrl: "./resources/p2d2-editor-config.json",
    layerId: "p2d2-geo-containers",
    // Wie die Kommunen-Animation des Standalone (src/components/MapCanvas.astro).
    focusDurationMs: 300,
    fetch: (url, options) => window.fetch(url, options),
    getMap: () => window.mapCollection?.getMap("2D") ?? null,
    transform,
    readFeatures: (json, featureProjection) => format.readFeatures(json, {dataProjection: "EPSG:4326", featureProjection}),
    debug: createDebug({enabled: readDebugFlag(), log: (...args) => console.debug(...args)})
};
