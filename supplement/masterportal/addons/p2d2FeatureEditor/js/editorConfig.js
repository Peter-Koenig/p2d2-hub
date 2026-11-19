// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Prüfung der Add-on-Konfiguration p2d2FeatureEditor
//
// Reines ES-Modul. Die Konfiguration liegt je Stage unter
// portal/resources/p2d2-editor-config.json und ist nach Layer-ID aus
// services-p2d2.json gegliedert. Es gibt keine stillen Standardwerte:
// fehlt ein Pflichtschlüssel oder hat er den falschen Typ, wird geworfen.

/**
 * Wirft einen TypeError mit Pfadangabe.
 * @param {string} path Pfad des Schlüssels, z. B. "layers.x.zoom.padding".
 * @param {string} expected Beschreibung des erwarteten Werts.
 * @returns {never} Wirft immer.
 */
function fail (path, expected) {
    throw new TypeError(`p2d2-editor-config: ${path} muss ${expected} sein`);
}

/**
 * @param {unknown} v Wert.
 * @returns {boolean} true für ein einfaches Objekt (kein Array, nicht null).
 */
function isObject (v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * @param {Object} obj Objekt.
 * @param {string} key Schlüssel.
 * @param {string} path Pfad für die Fehlermeldung.
 * @returns {Object} Das Unterobjekt.
 */
function requireObject (obj, key, path) {
    if (!isObject(obj[key])) {
        fail(`${path}.${key}`, "ein Objekt");
    }
    return obj[key];
}

/**
 * @param {Object} obj Objekt.
 * @param {string} key Schlüssel.
 * @param {string} path Pfad für die Fehlermeldung.
 * @returns {string} Nichtleerer String.
 */
function requireString (obj, key, path) {
    const v = obj[key];

    if (typeof v !== "string" || v.trim() === "") {
        fail(`${path}.${key}`, "ein nichtleerer String");
    }
    return v;
}

/**
 * @param {Object} obj Objekt.
 * @param {string} key Schlüssel.
 * @param {string} path Pfad für die Fehlermeldung.
 * @param {{min?: number, integer?: boolean, positive?: boolean}} [rule] Zusatzregeln.
 * @returns {number} Endliche Zahl.
 */
function requireNumber (obj, key, path, rule = {}) {
    const v = obj[key];

    if (typeof v !== "number" || !Number.isFinite(v)) {
        fail(`${path}.${key}`, "eine endliche Zahl");
    }
    if (rule.integer && !Number.isInteger(v)) {
        fail(`${path}.${key}`, "eine ganze Zahl");
    }
    if (rule.positive && v <= 0) {
        fail(`${path}.${key}`, "größer als 0");
    }
    if (rule.min !== undefined && v < rule.min) {
        fail(`${path}.${key}`, `mindestens ${rule.min}`);
    }
    return v;
}

/**
 * Prüft die Konfiguration eines Layers.
 * @param {Object} c Layer-Konfiguration.
 * @param {string} path Pfad für Fehlermeldungen.
 * @returns {void}
 */
function validateLayer (c, path) {
    const wfsBase = requireString(c, "wfsBase", path);

    if (wfsBase.includes("?")) {
        fail(`${path}.wfsBase`, "eine URL ohne Query");
    }
    requireString(c, "typeName", path);
    requireString(c, "proxyPath", path);
    requireNumber(c, "checkTimeoutMs", path, {integer: true, positive: true});

    const children = requireObject(c, "children", path),
        cPath = `${path}.children`;

    requireNumber(children, "level", cPath, {integer: true, min: 0});
    requireString(children, "separator", cPath);
    if (!Array.isArray(children.prefixFields) || children.prefixFields.length === 0 ||
        !children.prefixFields.every(f => typeof f === "string" && f.trim() !== "")) {
        fail(`${cPath}.prefixFields`, "eine nichtleere Liste nichtleerer Strings");
    }

    const editor = requireObject(c, "editor", path);

    requireString(editor, "windowNamePrefix", `${path}.editor`);
    requireString(editor, "windowFeatures", `${path}.editor`);

    const zoom = requireObject(c, "zoom", path),
        zPath = `${path}.zoom`;

    requireNumber(zoom, "padding", zPath, {min: 0});
    requireNumber(zoom, "durationMs", zPath, {min: 0});
    requireNumber(zoom, "minZoom", zPath, {min: 0});
    requireNumber(zoom, "maxZoom", zPath, {min: 0});
    if (zoom.maxZoom < zoom.minZoom) {
        fail(`${zPath}.maxZoom`, "mindestens minZoom");
    }

    const info = requireObject(c, "info", path),
        iPath = `${path}.info`;

    if (!Array.isArray(info.fields) || info.fields.length === 0) {
        fail(`${iPath}.fields`, "eine nichtleere Liste");
    }
    info.fields.forEach((f, i) => {
        if (!isObject(f)) {
            fail(`${iPath}.fields[${i}]`, "ein Objekt");
        }
        requireString(f, "key", `${iPath}.fields[${i}]`);
        requireString(f, "label", `${iPath}.fields[${i}]`);
    });

    const texts = requireObject(info, "texts", iPath);

    for (const key of ["noChildren", "popupBlocked", "checkTimeout", "checkFailed", "openEditor", "close"]) {
        requireString(texts, key, `${iPath}.texts`);
    }
}

/**
 * Prüft die gesamte Add-on-Konfiguration.
 * @param {Object} config Inhalt von p2d2-editor-config.json.
 * @returns {Object<string, Object>} Layer-Konfigurationen nach Layer-ID.
 * @throws {TypeError} Bei fehlenden oder falsch typisierten Pflichtschlüsseln.
 */
export function validateConfig (config) {
    if (!isObject(config)) {
        fail("(Wurzel)", "ein Objekt");
    }
    const layers = requireObject(config, "layers", "(Wurzel)"),
        ids = Object.keys(layers);

    if (ids.length === 0) {
        fail("layers", "mindestens einen Layer enthalten");
    }
    for (const id of ids) {
        if (!isObject(layers[id])) {
            fail(`layers.${id}`, "ein Objekt");
        }
        validateLayer(layers[id], `layers.${id}`);
    }
    return layers;
}
