// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: URL-Bau für den Astro-Feature-Editor aus dem Masterportal
//
// Reines ES-Modul ohne Imports, DOM, Vue oder OpenLayers. Es bildet den
// Vertrag zur Zielseite src/pages/feature-editor/[featureId].astro
// (Pflichtparameter wp_name, container_type, name, extent, projection) und zur
// Extent-Auswertung in src/components/feature-editor/EditorState.ts
// (extent.split(",").map(Number), Reihenfolge Lon/Lat in WGS84) ab.
// Präfixregel und CQL der Kinderprüfung entsprechen loadGrabflurData in
// src/utils/feature-popup-handler.ts, ergänzt um die Maskierung von Hochkommata.
//
// Ohne Eintrag in addons/addonsConf.json wird dieses Modul nicht gebündelt.
// Vertragstest: src/tests/masterportal-editor-contract.test.ts

const EXTENT_DECIMALS = 7;

/**
 * Prüft, ob ein Wert ein nichtleerer String ist, und wirft sonst.
 * @param {string} key Name des Werts für die Fehlermeldung.
 * @param {unknown} value Zu prüfender Wert.
 * @returns {string} Der unveränderte Wert.
 */
function requireText (key, value) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new TypeError(`editorUrl: Pflichtwert "${key}" fehlt oder ist leer`);
    }
    return value;
}

/**
 * Maskiert einen Wert für ein CQL-String-Literal, indem jedes Hochkomma
 * verdoppelt wird. Die umschließenden Hochkommata setzt der Aufrufer.
 * @param {string} value Rohwert.
 * @returns {string} Maskierter Wert.
 */
export function quoteCql (value) {
    return String(value).replace(/'/g, "''");
}

/**
 * Präfix der Kind-Features (Grabflure) eines Elternteils: admin_name
 * (getrimmt), falls nicht leer, sonst name.
 * @param {{name: string, admin_name?: (string|null)}} props Properties des Elternteils.
 * @returns {string} Präfix für das Muster "<Präfix>-%".
 */
export function childPrefix (props) {
    const admin = props?.admin_name;

    if (typeof admin === "string" && admin.trim() !== "") {
        return admin.trim();
    }
    return requireText("name", props?.name);
}

/**
 * CQL-Filter der Kinderprüfung. Alle drei Werte werden mit quoteCql maskiert.
 * Die LIKE-Platzhalter % und _ im Präfix bleiben wie im Standalone unmaskiert.
 * @param {{wpName: string, containerType: string, prefix: string}} args Eingaben.
 * @returns {string} CQL-Filter.
 */
export function buildChildCql ({wpName, containerType, prefix}) {
    const wp = quoteCql(requireText("wpName", wpName)),
        type = quoteCql(requireText("containerType", containerType)),
        pre = quoteCql(requireText("prefix", prefix));

    return `osm_admin_level=10 AND wp_name='${wp}' AND container_type='${type}' AND (name LIKE '${pre}-%')`;
}

/**
 * URL für die Kinderprüfung über den Stage-Proxy. Die innere WFS-URL folgt dem
 * Aufbau des Friedhofs-Layers in services-p2d2.json, ergänzt um count=1.
 * @param {{wfsBase: string, typeName: string, cql: string, proxyPath?: string}} args Eingaben.
 * @returns {string} Relativer Proxy-Pfad mit url-Parameter.
 */
export function buildChildCheckUrl ({wfsBase, typeName, cql, proxyPath = "/api/wfs-proxy"}) {
    requireText("wfsBase", wfsBase);
    if (wfsBase.includes("?")) {
        throw new TypeError("editorUrl: wfsBase darf keine Query enthalten");
    }
    const inner = `${wfsBase}?service=WFS&version=2.0.0&request=GetFeature` +
        `&typeName=${encodeURIComponent(requireText("typeName", typeName))}` +
        "&outputFormat=application%2Fjson&srsName=EPSG%3A4326&count=1" +
        `&CQL_FILTER=${encodeURIComponent(requireText("cql", cql))}`;

    return `${requireText("proxyPath", proxyPath)}?url=${encodeURIComponent(inner)}`;
}

/**
 * Formatiert einen WGS84-Extent für den URL-Parameter extent.
 * @param {number[]} extentWGS84 [minX, minY, maxX, maxY] in Lon/Lat.
 * @returns {string} "minX,minY,maxX,maxY" mit höchstens sieben Nachkommastellen.
 * @throws {TypeError} Bei falscher Länge, Nicht-Zahlen, nicht endlichen Werten oder min >= max.
 */
export function toExtentParam (extentWGS84) {
    if (!Array.isArray(extentWGS84) || extentWGS84.length !== 4) {
        throw new TypeError("editorUrl: extent muss genau vier Werte haben");
    }
    if (!extentWGS84.every(v => typeof v === "number" && Number.isFinite(v))) {
        throw new TypeError("editorUrl: extent enthält Nicht-Zahlen oder nicht endliche Werte");
    }
    const [minX, minY, maxX, maxY] = extentWGS84;

    if (minX >= maxX || minY >= maxY) {
        throw new RangeError("editorUrl: extent verlangt minX < maxX und minY < maxY");
    }
    return extentWGS84
        .map(v => {
            const s = v.toFixed(EXTENT_DECIMALS).replace(/\.?0+$/, "");

            return s === "-0" ? "0" : s;
        })
        .join(",");
}

/**
 * Relativer Pfad zum Astro-Feature-Editor. Die Query entsteht wie in
 * buildEditorUrl des Standalone mit URLSearchParams.
 * @param {{name: string, wpName: string, containerType: string, extentWGS84: number[], projection: string, osmAdminLevel?: (number|string)}} args Eingaben.
 * @returns {string} "/feature-editor/<name>?wp_name=…&container_type=…&name=…&extent=…&projection=…[&osm_admin_level=…]"
 * @throws {TypeError} Wenn ein Pflichtwert fehlt oder leer ist.
 */
export function buildEditorUrl ({name, wpName, containerType, extentWGS84, projection, osmAdminLevel}) {
    const params = new URLSearchParams({
        wp_name: requireText("wpName", wpName),
        container_type: requireText("containerType", containerType),
        name: requireText("name", name),
        extent: toExtentParam(extentWGS84),
        projection: requireText("projection", projection)
    });

    if (osmAdminLevel !== undefined && osmAdminLevel !== null && String(osmAdminLevel) !== "") {
        params.set("osm_admin_level", String(osmAdminLevel));
    }
    return `/feature-editor/${encodeURIComponent(name)}?${params}`;
}
