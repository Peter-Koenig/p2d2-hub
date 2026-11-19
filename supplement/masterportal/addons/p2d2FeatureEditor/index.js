// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Masterportal-Add-on p2d2FeatureEditor (Typ "javascript")
//
// Klick auf ein Feature eines konfigurierten Layers prüft per WFS, ob
// Kind-Features existieren, öffnet dann den Astro-Feature-Editor in einem
// eigenen Fenster oder zeigt einen Info-Dialog, und zoomt auf das Feature.
// Fachwerte stehen nicht hier, sondern in portal/resources/p2d2-editor-config.json.
//
// Ladezeitpunkt: Masterportal importiert Add-ons vor initializeMaps
// (src/App.vue, Watcher allConfigsLoaded). Die 2D-Karte wird deshalb über
// window.mapCollection abgewartet.

import {transformExtent} from "ol/proj.js";
import store from "@appstore/index.js";
import {createClickFlow, zoomTarget} from "./js/clickFlow.js";
import {validateConfig} from "./js/editorConfig.js";
import {showInfoDialog} from "./js/editorDialog.js";

const LOG = "[p2d2FeatureEditor]",
    // Relativ zur Portal-Seite, wie portalConf und layerConf in config.js.
    CONFIG_URL = "./resources/p2d2-editor-config.json",
    // Projektion des Editor-Extents (Vertrag mit EditorState.ts).
    EDITOR_EXTENT_CRS = "EPSG:4326",
    MAP_POLL_MS = 100,
    MAP_WAIT_MAX_MS = 30000;

/**
 * Lädt und prüft die Add-on-Konfiguration.
 * @returns {Promise<Object<string, Object>>} Layer-Konfigurationen nach Layer-ID.
 */
async function loadConfig () {
    const response = await fetch(CONFIG_URL, {cache: "no-cache"});

    if (!response.ok) {
        throw new Error(`${CONFIG_URL}: HTTP ${response.status}`);
    }
    return validateConfig(await response.json());
}

/**
 * Wartet auf die 2D-Karte in window.mapCollection.
 * @returns {Promise<Object>} Die OL-Karte.
 */
function waitForMap () {
    const start = Date.now();

    return new Promise((resolve, reject) => {
        const poll = () => {
            const map = window.mapCollection?.getMap("2D");

            if (map) {
                resolve(map);
            }
            else if (Date.now() - start > MAP_WAIT_MAX_MS) {
                reject(new Error("2D-Karte nicht verfügbar"));
            }
            else {
                setTimeout(poll, MAP_POLL_MS);
            }
        };

        poll();
    });
}

/**
 * Nur im 2D-Modus und wenn kein Werkzeug mit eigenen Karteninteraktionen
 * (Messen, Zeichnen, Auswahl …) aktiv ist. Dieselbe Bedingung nutzt das GFI
 * (GetFeatureInfo.vue, Watcher clickCoordinate).
 * @returns {boolean} true, wenn ein Klick ausgewertet werden darf.
 */
function clicksAllowed () {
    return store.getters["Maps/mode"] === "2D" &&
        store.getters["Menu/currentMouseMapInteractionsComponent"] === "getFeatureInfo";
}

/**
 * Öffnet ein Fenster.
 * @param {string} url URL.
 * @param {string} name Fenstername.
 * @param {string} features Fenstermerkmale.
 * @returns {Window|null} Fenster oder null, wenn blockiert.
 */
function openWindow (url, name, features) {
    return window.open(url, name, features);
}

/**
 * Abfrage für clickFlow.
 * @param {string} url URL.
 * @param {AbortSignal} signal Abbruchsignal.
 * @returns {Promise<{status: number, body: unknown}>} Status und JSON bei 200.
 */
async function fetchJson (url, signal) {
    const response = await fetch(url, {signal});

    return {status: response.status, body: response.status === 200 ? await response.json() : null};
}

/**
 * Zoomt auf einen Extent mit den Grenzen der Layer-Konfiguration.
 * @param {Object} map OL-Karte.
 * @param {number[]} extent Extent in Kartenprojektion.
 * @param {{padding: number, durationMs: number, minZoom: number, maxZoom: number}} zoom Zoom-Konfiguration.
 * @returns {void}
 */
function zoomToExtent (map, extent, zoom) {
    const view = map.getView(),
        {center, resolution} = zoomTarget({extent, size: map.getSize(), padding: zoom.padding});
    // Die Portal-View rastet auf ganze Stufen ein (constrainResolution in
    // masterportalapi mapView.js); abrunden, damit das ganze Feature sichtbar bleibt.
    let level = Math.floor(view.getZoomForResolution(resolution));

    if (!Number.isFinite(level)) {
        level = zoom.maxZoom;
    }
    view.animate({
        center,
        zoom: Math.min(zoom.maxZoom, Math.max(zoom.minZoom, level)),
        duration: zoom.durationMs
    });
}

/**
 * Registriert den Klick-Listener auf der 2D-Karte.
 * @param {Object} map OL-Karte.
 * @param {Object<string, Object>} layers Layer-Konfigurationen nach Layer-ID.
 * @returns {void}
 */
function register (map, layers) {
    const flow = createClickFlow({fetchJson, openWindow, setTimer: setTimeout, clearTimer: clearTimeout}),
        configured = layer => Object.prototype.hasOwnProperty.call(layers, layer.get("id"));

    map.on("click", async event => {
        if (!clicksAllowed()) {
            return;
        }
        let hit = null;

        // Oberstes Feature eines sichtbaren, konfigurierten Layers.
        map.forEachFeatureAtPixel(event.pixel, (feature, layer) => {
            hit = {feature, layerConfig: layers[layer.get("id")]};
            return true;
        }, {layerFilter: layer => layer.getVisible() && configured(layer)});

        const geometry = hit?.feature.getGeometry();

        if (!geometry) {
            return;
        }
        try {
            const props = hit.feature.getProperties(),
                projection = map.getView().getProjection().getCode(),
                extent = geometry.getExtent(),
                result = await flow.handle({
                    props,
                    layerConfig: hit.layerConfig,
                    extentWGS84: transformExtent(extent, projection, EDITOR_EXTENT_CRS),
                    projection
                });

            if (result.action === "stale") {
                return;
            }
            zoomToExtent(map, extent, hit.layerConfig.zoom);
            if (result.action === "info") {
                showInfoDialog({doc: document, props, layerConfig: hit.layerConfig, result, openWindow});
            }
        }
        catch (e) {
            console.error(LOG, "Klick konnte nicht verarbeitet werden:", e);
        }
    });
    console.info(LOG, "aktiv für Layer:", Object.keys(layers).join(", "));
}

Promise.all([loadConfig(), waitForMap()])
    .then(([layers, map]) => register(map, layers))
    .catch(e => console.error(LOG, "nicht aktiv:", e));

// Der Add-on-Lader erwartet einen Default-Export (src/plugins/addons.js, loadAddon).
export default {};
