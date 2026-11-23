// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: UTM-Zonen erkennen, proj4-Definition bilden, registrieren
//
// Reines Modul ohne Masterportal-Importe; Registrierung über injizierte
// Funktionen (js/runtime.js liefert die echten). Gilt für jede Zone:
//   EPSG:326xx  WGS 84 / UTM Nord
//   EPSG:327xx  WGS 84 / UTM Süd (+south)
//   EPSG:258xx  ETRS89 / UTM (GRS80)
// Zonen 1–60, wie src/utils/crs.ts (registerUtm) im Standalone.

const UTM_CODE = /^EPSG:(326|327|258)(\d{2})$/;

/**
 * Zerlegt einen UTM-Code.
 * @param {unknown} code EPSG-Code.
 * @returns {{prefix: string, zone: number}|null} Präfix und Zone oder null.
 */
function parseUtm (code) {
    const match = typeof code === "string" ? UTM_CODE.exec(code) : null,
        zone = match ? Number(match[2]) : 0;

    return zone >= 1 && zone <= 60 ? {prefix: match[1], zone} : null;
}

/**
 * Prüft, ob ein Code eine UTM-Projektion bezeichnet.
 * @param {unknown} code EPSG-Code, z. B. "EPSG:32737".
 * @returns {boolean} true für 326xx, 327xx, 258xx mit Zone 1–60.
 */
export function isUtm (code) {
    return parseUtm(code) !== null;
}

/**
 * Bildet die proj4-Definition einer UTM-Zone.
 * @param {unknown} code EPSG-Code.
 * @returns {string|null} proj4-Definition oder null, wenn kein UTM-Code.
 */
export function utmDefinition (code) {
    const utm = parseUtm(code);

    if (!utm) {
        return null;
    }
    const parts = ["+proj=utm", `+zone=${utm.zone}`];

    if (utm.prefix === "327") {
        parts.push("+south");
    }
    if (utm.prefix === "258") {
        parts.push("+ellps=GRS80", "+towgs84=0,0,0,0,0,0,0");
    }
    else {
        parts.push("+ellps=WGS84");
    }
    parts.push("+units=m", "+no_defs");
    return parts.join(" ");
}

/**
 * Anzeigename eines CRS für den Umschalter.
 * @param {string} code EPSG-Code.
 * @returns {string} z. B. "UTM 32N (ETRS89)", "Web-Mercator" oder der Code selbst.
 */
export function crsLabel (code) {
    const utm = parseUtm(code);

    if (utm) {
        const hemisphere = utm.prefix === "327" ? "S" : "N",
            datum = utm.prefix === "258" ? "ETRS89" : "WGS 84";

        return `UTM ${utm.zone}${hemisphere} (${datum})`;
    }
    return code === "EPSG:3857" ? "Web-Mercator" : code;
}

/**
 * Erzeugt eine Funktion, die sicherstellt, dass eine Projektion bekannt ist.
 * UTM-Zonen ohne proj4-Definition werden registriert. ol 10 kennt 326xx/327xx
 * zwar selbst, die Registrierung über masterportalapi ergänzt aber den
 * GeoServer-Alias und die Kennung für das Koordinatenwerkzeug.
 * Andere Codes (z. B. EPSG:3857) werden nur geprüft.
 * @param {Object} deps Abhängigkeiten.
 * @param {function(string): boolean} deps.hasDefinition true, wenn proj4 den Code kennt.
 * @param {function(string): (Object|null)} deps.getProjection OL-Projektion oder null.
 * @param {function(Array<[string, string]>): void} deps.registerProjections Registrierung [[code, def]].
 * @returns {function(string): boolean} ensureProjection(code) → true, wenn die Projektion danach verfügbar ist.
 */
export function createEnsureProjection ({hasDefinition, getProjection, registerProjections}) {
    return function ensureProjection (code) {
        try {
            const definition = utmDefinition(code);

            if (definition && !hasDefinition(code)) {
                registerProjections([[code, definition]]);
            }
            return Boolean(getProjection(code));
        }
        catch (e) {
            console.error("[p2d2Crs] Projektion nicht registrierbar:", code, e);
            return false;
        }
    };
}
