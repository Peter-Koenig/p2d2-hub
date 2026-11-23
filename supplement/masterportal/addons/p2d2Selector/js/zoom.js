// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Zoom-Regel des Add-ons p2d2Selector (Kommune → Portal-Stufe)
//
// Reines ES-Modul ohne Imports. Die Collections geben einen Web-Zoom an
// (map.zoom). Der Standalone erzeugt seine View ohne Auflösungstabelle; in
// einer per proj4 registrierten UTM-Projektion ohne Extent rechnet OpenLayers
// dann mit der Weltgröße 2π·6370997 m / 256 px. Im Masterportal wird diese
// Auflösung auf die nächste Stufe der Portal-Tabelle eingerastet, linear wie
// OpenLayers bei constrainResolution (gleiche Regel wie snapResolution im
// Add-on p2d2Crs, hier ohne Import nachgebildet).
//
// Vertragstest: src/tests/masterportal-selector-zoom.test.ts

/** Erdradius der OpenLayers-Einheit „degrees“ (ol/proj/Units.js METERS_PER_UNIT). */
const RADIUS = 6370997,
    TILE_SIZE = 256;

/**
 * Auflösung eines Web-Zooms in einer Projektion ohne Extent (Standalone-View).
 * @param {number} zoom Zoomstufe der Collection.
 * @returns {number} Auflösung in m/px.
 */
export function zoomToResolution (zoom) {
    if (typeof zoom !== "number" || !Number.isFinite(zoom)) {
        throw new TypeError(`zoom: ungültiger Zoom ${zoom}`);
    }
    return 2 * Math.PI * RADIUS / TILE_SIZE / 2 ** zoom;
}

/**
 * Nächste Stufe der Portal-Tabelle (linear, bei Gleichstand die feinere;
 * außerhalb der Tabelle die Randstufe).
 * @param {number} resolution Auflösung.
 * @param {number[]} resolutions Absteigend sortierte Auflösungen der Portal-Tabelle.
 * @returns {{stage: number, resolution: number}} Index und Auflösung der Stufe.
 */
export function snapToStage (resolution, resolutions) {
    if (!Array.isArray(resolutions) || resolutions.length === 0) {
        throw new TypeError("zoom: resolutions fehlt");
    }
    if (typeof resolution !== "number" || !Number.isFinite(resolution) || resolution <= 0) {
        throw new TypeError(`zoom: ungültige Auflösung ${resolution}`);
    }
    let stage = resolutions.length - 1;

    if (resolution >= resolutions[0]) {
        stage = 0;
    }
    else {
        for (let i = 1; i < resolutions.length; i++) {
            if (resolution >= resolutions[i]) {
                stage = resolutions[i - 1] - resolution < resolution - resolutions[i] ? i - 1 : i;
                break;
            }
        }
    }
    return {stage, resolution: resolutions[stage]};
}

/**
 * Ziel der Fokussierung auf eine Kommune.
 * @param {{center: number[], zoom: number, resolutions: number[]}} args Zentrum in der View-Projektion, Zoom der Collection, Portal-Auflösungen.
 * @returns {{center: number[], resolution: number, stage: number}} Ziel für view.animate und Maps/setInitialZoom.
 */
export function zoomTarget ({center, zoom, resolutions}) {
    if (!Array.isArray(center) || center.length !== 2 || !center.every(v => typeof v === "number" && Number.isFinite(v))) {
        throw new TypeError("zoom: center muss [Zahl, Zahl] sein");
    }
    const {stage, resolution} = snapToStage(zoomToResolution(zoom), resolutions);

    return {center: [...center], resolution, stage};
}
