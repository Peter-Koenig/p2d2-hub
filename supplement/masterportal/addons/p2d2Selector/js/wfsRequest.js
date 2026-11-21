// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: WFS-Request für die Auswahl (Kommune, Kategorie) des Add-ons p2d2Selector
//
// Reines ES-Modul ohne Imports. CQL wie im Standalone
// (src/utils/wfs-layer-manager.ts), ergänzt um die Maskierung von Hochkommata
// wie im p2d2FeatureEditor (editorUrl.js quoteCql). Die innere URL folgt
// buildWFSURL aus @p2d2/core (Parameter-Reihenfolge und Kodierung), die äußere
// dem Stage-Proxy des Standalone (src/utils/wfs-auth.ts).
//
// Vertragstest: src/tests/masterportal-selector-request.test.ts

/**
 * Prüft, ob ein Wert ein nichtleerer String ist, und wirft sonst.
 * @param {string} key Name des Werts für die Fehlermeldung.
 * @param {unknown} value Zu prüfender Wert.
 * @returns {string} Der unveränderte Wert.
 */
function requireText (key, value) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new TypeError(`wfsRequest: Pflichtwert "${key}" fehlt oder ist leer`);
    }
    return value;
}

/**
 * Maskiert einen Wert für ein CQL-String-Literal (jedes Hochkomma verdoppelt).
 * @param {string} value Rohwert.
 * @returns {string} Maskierter Wert.
 */
export function quoteCql (value) {
    return String(value).replace(/'/g, "''");
}

/**
 * CQL-Filter der Auswahl.
 * @param {{wpName: string, containerType: string, level: number}} args Eingaben.
 * @returns {string} "wp_name='…' AND container_type='…' AND osm_admin_level=<level>"
 * @throws {TypeError} Bei leeren Texten oder einem Level, das keine ganze Zahl ist.
 */
export function buildCql ({wpName, containerType, level}) {
    if (!Number.isInteger(level)) {
        throw new TypeError(`wfsRequest: level muss eine ganze Zahl sein, nicht ${JSON.stringify(level)}`);
    }
    const wp = quoteCql(requireText("wpName", wpName)),
        type = quoteCql(requireText("containerType", containerType));

    return `wp_name='${wp}' AND container_type='${type}' AND osm_admin_level=${level}`;
}

/**
 * URL des Auswahl-Layers über den Stage-Proxy. Innere URL wie buildWFSURL
 * (@p2d2/core) mit Workspace-Endpunkt, ohne count.
 * @param {{wfsBase: string, typeName: string, proxyPath: string, cql: string}} args Eingaben (alle Pflicht).
 * @returns {string} "<proxyPath>?url=<encodeURIComponent(WFS-URL)>"
 * @throws {TypeError} Bei fehlenden Werten oder einer wfsBase mit Query.
 */
export function buildLayerUrl ({wfsBase, typeName, proxyPath, cql}) {
    if (requireText("wfsBase", wfsBase).includes("?")) {
        throw new TypeError("wfsRequest: wfsBase darf keine Query enthalten");
    }
    const params = [
            ["service", "WFS"],
            ["version", "2.0.0"],
            ["request", "GetFeature"],
            ["typeName", requireText("typeName", typeName)],
            ["outputFormat", "application/json"],
            ["srsName", "EPSG:4326"],
            ["CQL_FILTER", requireText("cql", cql)]
        ],
        inner = `${wfsBase}?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}`;

    return `${requireText("proxyPath", proxyPath)}?url=${encodeURIComponent(inner)}`;
}

/**
 * Prüft die Stage-Werte des Auswahl-Layers aus p2d2-editor-config.json
 * (layers[layerId]). Es gibt keine Standardwerte.
 * @param {unknown} config Inhalt von p2d2-editor-config.json.
 * @param {string} layerId Layer-ID aus services-p2d2.json.
 * @returns {{ok: true, stage: {wfsBase: string, typeName: string, proxyPath: string}}|{ok: false, error: string}} Ergebnis.
 */
export function readStage (config, layerId) {
    const layer = config?.layers?.[layerId],
        stage = {},
        missing = [];

    if (typeof layer !== "object" || layer === null || Array.isArray(layer)) {
        return {ok: false, error: `p2d2-editor-config: layers.${layerId} fehlt`};
    }
    for (const key of ["wfsBase", "typeName", "proxyPath"]) {
        if (typeof layer[key] !== "string" || layer[key].trim() === "") {
            missing.push(key);
        }
        else {
            stage[key] = layer[key];
        }
    }
    if (missing.length > 0) {
        return {ok: false, error: `p2d2-editor-config: layers.${layerId}.${missing.join(", ")} fehlt oder ist leer`};
    }
    if (stage.wfsBase.includes("?")) {
        return {ok: false, error: `p2d2-editor-config: layers.${layerId}.wfsBase darf keine Query enthalten`};
    }
    return {ok: true, stage};
}

/**
 * Request für eine Auswahl aus Kommune und Kategorie.
 * @param {{kommune: Object, kategorie: Object, stage: {wfsBase: string, typeName: string, proxyPath: string}}} args Eingaben.
 * @returns {{cql: string, url: string}} CQL und Layer-URL.
 * @throws {TypeError} Wenn die Kommune für den containerType kein Level hat.
 */
export function selectionRequest ({kommune, kategorie, stage}) {
    const containerType = kategorie?.containerType,
        cql = buildCql({
            wpName: kommune?.wpName,
            containerType,
            level: kommune?.osmAdminLevel?.[containerType]
        });

    return {cql, url: buildLayerUrl({...stage, cql})};
}
