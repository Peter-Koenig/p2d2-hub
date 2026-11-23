// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Debug-Ausgabe des Add-ons p2d2Selector
//
// Reines ES-Modul. Aktiv nur mit ?p2d2debug=1 in der Portal-URL; die Ausgabe
// geht an eine injizierte Funktion (im Portal console.debug).

/** Präfix jeder Ausgabe. */
export const DEBUG_PREFIX = "[p2d2Selector]";

/**
 * @param {string} search Query der Portal-URL (location.search), mit oder ohne "?".
 * @returns {boolean} true bei p2d2debug=1.
 */
export function debugEnabled (search) {
    return new URLSearchParams(typeof search === "string" ? search : "").get("p2d2debug") === "1";
}

/**
 * Erzeugt die Debug-Funktion.
 * @param {{enabled: boolean, log: function(...*): void}} args Schalter und Ausgabe.
 * @returns {function(string, Object=): void} debug(event, data); ohne Schalter ohne Wirkung.
 */
export function createDebug ({enabled, log}) {
    if (!enabled || typeof log !== "function") {
        return () => undefined;
    }
    return (event, data) => log(DEBUG_PREFIX, event, data ?? {});
}
