// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Animation oder Sprung beim Fokussieren einer Kommune (Add-on p2d2Selector)
//
// Reines ES-Modul ohne Imports. Die Basiskarte (TileWMS über MapProxy) fordert
// für jedes Bild einer Animation Kacheln an, auch während der Animation (seit
// OpenLayers 6 ohne Schalter). Ein langer Weg erzeugt so hunderte Anfragen für
// Ansichten, die niemand sieht. Deshalb springt die View:
//   - nach einem Projektionswechsel immer (der Weg im neuen Koordinatenraum
//     hat keine Bedeutung, swapView baut die View bereits am Ziel),
//   - in gleicher Projektion ab mehr als MAX_ANIMATED_SCREENS Bildschirmbreiten.
//
// Vertragstest: src/tests/masterportal-selector-motion.test.ts

/** Längster animierter Weg in Bildschirmbreiten (längere Seite der Karte). */
export const MAX_ANIMATED_SCREENS = 3;

/** Gründe im Debug-Ereignis focus. */
export const MOTION_REASONS = Object.freeze(["disabled", "projection-change", "distance", "animated"]);

/**
 * @param {*} value Wert.
 * @returns {boolean} true bei [Zahl, Zahl] mit endlichen Werten.
 */
function isPoint (value) {
    return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

/**
 * @param {*} value Wert.
 * @returns {boolean} true bei [Breite, Höhe] mit positiven Werten.
 */
function isSize (value) {
    return Array.isArray(value) && value.length === 2 && value.every(v => Number.isFinite(v) && v > 0);
}

/**
 * Dauer der Fokus-Animation.
 * Ohne Kartengröße, Ausgangszentrum oder Auflösung entfällt die Streckenregel
 * (die Animation läuft wie vorher).
 * @param {Object} args Eingaben.
 * @param {boolean} args.projectionChanged true, wenn die View gerade in eine andere Projektion getauscht wurde.
 * @param {number[]} args.from Zentrum der View vor der Animation.
 * @param {number[]} args.to Zielzentrum.
 * @param {number} args.resolution Auflösung der View vor der Animation.
 * @param {(number[]|null)} args.size Kartengröße in Pixeln.
 * @param {number} args.focusDurationMs Konfigurierte Dauer.
 * @returns {{duration: number, reason: string}} Dauer in ms und Grund (MOTION_REASONS).
 */
export function animationDuration ({projectionChanged, from, to, resolution, size, focusDurationMs}) {
    if (!(typeof focusDurationMs === "number" && focusDurationMs > 0)) {
        return {duration: 0, reason: "disabled"};
    }
    if (projectionChanged) {
        return {duration: 0, reason: "projection-change"};
    }
    if (!isPoint(from) || !isPoint(to) || !(Number.isFinite(resolution) && resolution > 0) || !isSize(size)) {
        return {duration: focusDurationMs, reason: "animated"};
    }
    const pixels = Math.hypot(to[0] - from[0], to[1] - from[1]) / resolution;

    return pixels > MAX_ANIMATED_SCREENS * Math.max(size[0], size[1])
        ? {duration: 0, reason: "distance"}
        : {duration: focusDurationMs, reason: "animated"};
}
