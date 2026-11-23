// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Ablauf nach einem Klick auf ein konfiguriertes Feature
//
// Reines ES-Modul ohne DOM, OpenLayers und Vue. Bildet handleCemeteryClick
// und openFeatureEditor aus src/utils/feature-popup-handler.ts nach:
// Kinderprüfung per WFS, mit Treffern Editor-Fenster, sonst Info. Abfrage,
// Fenster und Zeitgeber werden injiziert.
//
// Ablauftest: src/tests/masterportal-editor-flow.test.ts

import {buildChildCheckUrl, buildChildCql, buildEditorUrl, childPrefix} from "./editorUrl.js";

/**
 * @typedef {Object} FlowResult
 * @property {"opened"|"info"|"stale"} action Ergebnis.
 * @property {"no-children"|"check-failed"|"check-timeout"|"popup-blocked"} [reason] Grund bei "info".
 * @property {string|null} [editorUrl] Fertige Editor-URL (für den Button im Dialog).
 * @property {string} [windowName] Fenstername für window.open.
 * @property {string} [windowFeatures] Fenstermerkmale für window.open.
 */

/**
 * Wertet die Antwort der Kinderprüfung aus.
 * @param {{status: number, body: unknown}} res Antwort von fetchJson.
 * @returns {"has-children"|"no-children"|"check-failed"} Ergebnis.
 */
function evaluate (res) {
    if (res?.status !== 200 || !Array.isArray(res?.body?.features)) {
        return "check-failed";
    }
    return res.body.features.length > 0 ? "has-children" : "no-children";
}

/**
 * Erzeugt den Klick-Ablauf. Jeder neue Aufruf von handle macht ältere
 * hinfällig: deren Abfrage wird abgebrochen, ihr Ergebnis ist "stale".
 * @param {Object} deps Abhängigkeiten.
 * @param {function(string, AbortSignal): Promise<{status: number, body: unknown}>} deps.fetchJson Abfrage.
 * @param {function(string, string, string): (Object|null)} deps.openWindow window.open-Ersatz.
 * @param {function(function(): void, number): unknown} deps.setTimer setTimeout-Ersatz.
 * @param {function(unknown): void} deps.clearTimer clearTimeout-Ersatz.
 * @returns {{handle: function(Object): Promise<FlowResult>}} Ablauf.
 */
export function createClickFlow ({fetchJson, openWindow, setTimer, clearTimer}) {
    let current = 0,
        controller = null;

    /**
     * @param {Object} args Eingaben.
     * @param {Object} args.props Properties des geklickten Features.
     * @param {Object} args.layerConfig Geprüfte Layer-Konfiguration (validateConfig).
     * @param {number[]} args.extentWGS84 Extent des Features in Lon/Lat.
     * @param {string} args.projection Kartenprojektion, z. B. "EPSG:25832".
     * @returns {Promise<FlowResult>} Ergebnis.
     */
    async function handle ({props, layerConfig, extentWGS84, projection}) {
        const seq = ++current,
            {children, editor} = layerConfig;
        let editorUrl, checkUrl;

        if (controller) {
            controller.abort();
            controller = null;
        }

        try {
            const prefix = childPrefix(props, children.prefixFields),
                cql = buildChildCql({
                    wpName: props.wp_name,
                    containerType: props.container_type,
                    childLevel: children.level,
                    prefix,
                    separator: children.separator
                });

            checkUrl = buildChildCheckUrl({
                wfsBase: layerConfig.wfsBase,
                typeName: layerConfig.typeName,
                cql,
                proxyPath: layerConfig.proxyPath
            });
            editorUrl = buildEditorUrl({
                name: props.name,
                wpName: props.wp_name,
                containerType: props.container_type,
                extentWGS84,
                projection,
                osmAdminLevel: props.osm_admin_level
            });
        }
        catch (e) {
            console.warn("[p2d2FeatureEditor] Feature unvollständig:", e);
            return {action: "info", reason: "check-failed", editorUrl: null};
        }

        const windowName = `${editor.windowNamePrefix}${encodeURIComponent(props.name)}`,
            windowFeatures = editor.windowFeatures,
            own = new AbortController();
        let timedOut = false,
            outcome;

        controller = own;
        const timer = setTimer(() => {
            timedOut = true;
            own.abort();
        }, layerConfig.checkTimeoutMs);

        try {
            outcome = evaluate(await fetchJson(checkUrl, own.signal));
        }
        catch (e) {
            outcome = timedOut ? "check-timeout" : "check-failed";
        }
        finally {
            clearTimer(timer);
            if (controller === own) {
                controller = null;
            }
        }

        if (seq !== current) {
            return {action: "stale"};
        }
        if (outcome !== "has-children") {
            return {action: "info", reason: outcome, editorUrl, windowName, windowFeatures};
        }
        if (openWindow(editorUrl, windowName, windowFeatures)) {
            return {action: "opened", editorUrl, windowName, windowFeatures};
        }
        return {action: "info", reason: "popup-blocked", editorUrl, windowName, windowFeatures};
    }

    return {handle};
}

/**
 * Zielauflösung und Mittelpunkt, damit ein Extent mit Rand in die Karte passt
 * (Rechnung wie zoomToFeature im Standalone).
 * @param {{extent: number[], size: number[], padding: number}} args Extent in
 *   Kartenprojektion, Kartengröße in Pixeln, Rand in Pixeln.
 * @returns {{center: number[], resolution: number}} Ziel.
 * @throws {TypeError} Bei ungültigen Eingaben oder zu kleiner Karte.
 */
export function zoomTarget ({extent, size, padding}) {
    const finite = v => typeof v === "number" && Number.isFinite(v);

    if (!Array.isArray(extent) || extent.length !== 4 || !extent.every(finite) ||
        !Array.isArray(size) || size.length !== 2 || !size.every(finite) ||
        !finite(padding) || padding < 0) {
        throw new TypeError("zoomTarget: ungültige Eingaben");
    }
    const [minX, minY, maxX, maxY] = extent,
        usableW = size[0] - 2 * padding,
        usableH = size[1] - 2 * padding;

    if (usableW <= 0 || usableH <= 0) {
        throw new TypeError("zoomTarget: Karte kleiner als der Rand");
    }
    return {
        center: [(minX + maxX) / 2, (minY + maxY) / 2],
        resolution: Math.max((maxX - minX) / usableW, (maxY - minY) / usableH)
    };
}
