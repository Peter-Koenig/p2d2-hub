// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Aktionen des Add-ons p2d2Selector
//
// createActions bekommt die Laufzeit-Abhängigkeiten (js/runtime.js), damit die
// Aktionen ohne Masterportal testbar sind. Ablauf von applySelection und
// focusKommune: README, Abschnitt „p2d2Selector“.

import {selectionSignature, toggleSelection, validateSelection, findKategorie, findKommune} from "../js/selection.js";
import {readStage, selectionRequest} from "../js/wfsRequest.js";
import {zoomTarget, zoomToResolution} from "../js/zoom.js";
import {createLayerControl} from "../js/layerControl.js";

const LOG = "[p2d2Selector]",
    HTML_ESCAPES = {"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"};

/**
 * Maskiert Text für den HTML-Inhalt einer Meldung (Alerting rendert content per v-html).
 * @param {string} text Text.
 * @returns {string} Maskierter Text.
 */
export function escapeHtml (text) {
    return String(text).replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
}

/**
 * Lädt eine JSON-Datei; HTTP-Fehler werden geworfen.
 * @param {Function} fetch Wie window.fetch.
 * @param {string} url Pfad.
 * @returns {Promise<unknown>} Geparster Inhalt.
 */
async function fetchJson (fetch, url) {
    const response = await fetch(url, {cache: "no-cache"});

    if (!response.ok) {
        throw new Error(`${url}: HTTP ${response.status}`);
    }
    return response.json();
}

/**
 * Erzeugt die Store-Aktionen.
 * @param {Object} runtime Laufzeit.
 * @param {string} runtime.url Pfad der Auswahl-Datei.
 * @param {string} [runtime.stageUrl] Pfad von p2d2-editor-config.json.
 * @param {string} [runtime.layerId] ID des Auswahl-Layers.
 * @param {Function} runtime.fetch Wie window.fetch.
 * @param {function(): (Object|null)} [runtime.getMap] 2D-Karte.
 * @param {Function} [runtime.transform] ol/proj transform.
 * @param {function(Object, *): Array} [runtime.readFeatures] GeoJSON lesen.
 * @param {number} [runtime.focusDurationMs] Dauer der Zoom-Animation.
 * @param {function(string, Object=): void} [runtime.debug] Debug-Ausgabe.
 * @returns {Object<string, Function>} Aktionen.
 */
export function createActions ({url, stageUrl, layerId, fetch, getMap = () => null, transform, readFeatures, focusDurationMs = 0, debug = () => undefined}) {
    const layerControl = createLayerControl({fetch, readFeatures, debug});

    /**
     * Fehler der Auswahl: Status im Panel, Meldung über Alerting, Konsole.
     * @param {Object} context Store-Kontext.
     * @param {string} message Meldung.
     * @returns {void}
     */
    function reportError ({state, commit, dispatch}, message) {
        const what = [findKommune(state.selection, state.kommuneSlug)?.title, findKategorie(state.selection, state.kategorieSlug)?.title]
            .filter(Boolean).join(" · ");

        commit("setLayerStatus", {status: "error", error: message});
        // Erneutes Anwenden derselben Auswahl soll wieder laden.
        commit("setAppliedSignature", null);
        dispatch("Alerting/addSingleAlert", {
            category: "error",
            title: "additional:modules.p2d2Selector.alertTitle",
            content: escapeHtml(what ? `${what}: ${message}` : message),
            mustBeConfirmed: false
        }, {root: true});
        console.error(LOG, message);
    }

    /**
     * Vektorquelle des Auswahl-Layers in der 2D-Karte.
     * @returns {Object|null} Quelle oder null.
     */
    function layerSource () {
        const layer = getMap()?.getAllLayers?.().find(l => l.get("id") === layerId);

        return layer?.getSource?.() ?? null;
    }

    /**
     * Fokussiert eine Kommune: lokales CRS, View-Austausch, Zoom, Startansicht.
     * Alles synchron (README „Ablauf applySelection“).
     * @param {Object} context Store-Kontext.
     * @param {Object} kommune Eintrag aus p2d2-selection.json.
     * @returns {{ok: true}|{ok: false, error: string}} Ergebnis.
     */
    function focusKommune ({commit, dispatch, rootGetters}, kommune) {
        const code = kommune.map.projection;

        if (rootGetters["Maps/mode"] !== "2D") {
            return {ok: false, error: "Kommunenwahl nur in der 2D-Karte"};
        }
        dispatch("Modules/P2d2Crs/setLocalCrs", code, {root: true});
        if (rootGetters["Modules/P2d2Crs/localCrs"] !== code) {
            return {ok: false, error: `lokales CRS ${code} nicht verfügbar`};
        }
        dispatch("Modules/P2d2Crs/activateLocal", undefined, {root: true});

        const view = getMap()?.getView?.(),
            viewCode = view?.getProjection().getCode();

        if (viewCode !== code) {
            return {ok: false, error: `Kartenprojektion ${viewCode ?? "unbekannt"} statt ${code}`};
        }
        const target = zoomTarget({
            center: transform(kommune.map.center, "EPSG:4326", code),
            zoom: kommune.map.zoom,
            resolutions: view.getResolutions()
        });

        view.animate({center: target.center, resolution: target.resolution, duration: focusDurationMs}, () => {
            debug("view", {
                projection: view.getProjection().getCode(),
                resolution: view.getResolution(),
                center: view.getCenter(),
                // View-Property extent (öffentliche API ol/Object#get); ohne Extent null.
                extent: view.get?.("extent") ?? null
            });
        });
        // Startansicht (totalView) führt zur Kommune; gerundet wie der Vergleich in TotalView.vue.
        commit("Maps/setInitialCenter", target.center.map(Math.round), {root: true});
        commit("Maps/setInitialZoom", target.stage, {root: true});
        commit("setFocusedSlug", kommune.slug);
        debug("focus", {
            slug: kommune.slug,
            projection: code,
            zoom: kommune.map.zoom,
            zoomResolution: zoomToResolution(kommune.map.zoom),
            stage: target.stage,
            resolution: target.resolution,
            center: target.center
        });
        return {ok: true};
    }

    return {
        /**
         * Lädt und prüft die Auswahl-Datei. Fehler setzen loadStatus "error" und
         * lastError, sie werden nicht geworfen.
         * @param {Object} context Store-Kontext.
         * @returns {Promise<void>} Fertig, sobald der Status feststeht.
         */
        async loadSelection ({state, commit}) {
            if (state.loadStatus === "loading") {
                return;
            }
            commit("setLoadStatus", "loading");
            commit("setLastError", null);
            try {
                const json = await fetchJson(fetch, url),
                    result = validateSelection(json);

                if (!result.ok) {
                    throw new Error(`${url}: ungültig (${result.errors.slice(0, 3).join("; ")})`);
                }
                commit("setSelection", json);
                commit("setLoadStatus", "ready");
            }
            catch (error) {
                commit("setLastError", error?.message ?? String(error));
                commit("setLoadStatus", "error");
                console.error(LOG, "Auswahl nicht ladbar:", error);
            }
        },

        /**
         * Lädt die Stage-Werte des Auswahl-Layers (wfsBase, typeName, proxyPath)
         * aus p2d2-editor-config.json. Ohne gültige Werte: stageStatus "error".
         * @param {Object} context Store-Kontext.
         * @returns {Promise<void>} Fertig, sobald der Status feststeht.
         */
        async loadStage ({state, commit}) {
            if (state.stageStatus === "loading") {
                return;
            }
            commit("setStage", {stage: null, status: "loading", error: null});
            try {
                const result = readStage(await fetchJson(fetch, stageUrl), layerId);

                if (!result.ok) {
                    throw new Error(result.error);
                }
                commit("setStage", {stage: result.stage, status: "ready", error: null});
            }
            catch (error) {
                commit("setStage", {stage: null, status: "error", error: error?.message ?? String(error)});
                console.error(LOG, "Stage-Werte nicht ladbar:", error);
            }
        },

        /**
         * Wendet einen Kachelklick an. Nur bei geänderter Auswahl folgt applySelection.
         * @param {Object} context Store-Kontext.
         * @param {{kommuneSlug?: string, kategorieSlug?: string}} click Geklickte Slugs.
         * @returns {void}
         */
        select ({state, commit, dispatch}, click) {
            if (!state.selection) {
                return;
            }
            const next = toggleSelection(state, click, state.selection);

            if (next.kommuneSlug === state.kommuneSlug && next.kategorieSlug === state.kategorieSlug) {
                return;
            }
            commit("setSelected", next);
            dispatch("applySelection", {
                ...next,
                kommune: findKommune(state.selection, next.kommuneSlug),
                kategorie: findKategorie(state.selection, next.kategorieSlug)
            });
        },

        /**
         * Überträgt eine Auswahl auf Karte und Layer (synchron).
         * @param {Object} context Store-Kontext.
         * @param {{kommuneSlug: (string|null), kategorieSlug: (string|null), kommune: (Object|null), kategorie: (Object|null)}} next Auswahl.
         * @returns {void}
         */
        applySelection (context, next) {
            const {state, commit} = context,
                signature = selectionSignature(next);

            if (signature === state.appliedSignature) {
                return;
            }
            commit("setAppliedSignature", signature);
            debug("selection", {signature});

            if (!next.kommune) {
                commit("setFocusedSlug", null);
            }
            else if (next.kommune.slug !== state.focusedSlug) {
                const focus = focusKommune(context, next.kommune);

                if (!focus.ok) {
                    const source = layerSource();

                    if (source) {
                        layerControl.load(source, null, () => undefined);
                    }
                    reportError(context, focus.error);
                    return;
                }
            }

            const source = layerSource();

            if (!source) {
                reportError(context, `Layer ${layerId} nicht gefunden`);
                return;
            }
            if (!next.kommune || !next.kategorie) {
                layerControl.load(source, null, event => commit("setLayerStatus", event));
                return;
            }
            let request;

            try {
                if (!state.stage) {
                    throw new Error(state.stageError ?? "Stage-Werte (p2d2-editor-config.json) nicht geladen");
                }
                request = selectionRequest({kommune: next.kommune, kategorie: next.kategorie, stage: state.stage});
            }
            catch (error) {
                layerControl.load(source, null, () => undefined);
                reportError(context, error?.message ?? String(error));
                return;
            }
            debug("load", {signature, url: request.url, cql: request.cql});
            layerControl.load(source, request.url, event => {
                if (event.status === "error") {
                    reportError(context, event.error);
                }
                else {
                    commit("setLayerStatus", event);
                }
            });
        }
    };
}
