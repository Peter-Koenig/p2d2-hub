// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Ausschnitt der Kommunenwahl im Add-on p2d2Selector (Extent → Portal-Stufe)
//
// Reines ES-Modul (Import nur aus js/zoom.js). Die Karte füllt im Masterportal
// das ganze Fenster, das ausgeklappte Hauptmenü liegt darüber (App.vue,
// MenuContainer.vue). Die sichtbare Fläche ist deshalb die Kartengröße minus
// Padding; das Padding verschiebt das Zentrum, die Auflösung bestimmt der
// Modus.
//
// Modi (URL-Parameter p2d2Fit, einmal beim Start gelesen):
//   nearest  nächste Stufe zur passenden Auflösung (wie ol/View#fit mit nearest: true)
//   ceil     feinste Stufe, bei der die ganze BBox sichtbar ist (wie fit mit nearest: false)
//   exact    passende Auflösung ohne Einrasten (wie fit mit constrainResolution: false)
//   tight    BBox füllt die sichtbare Fläche (die kürzere Seite passt, die längere
//            darf überstehen), dann wie ceil
//
// Vertragstest: src/tests/masterportal-selector-fit.test.ts

import {snapToStage} from "./zoom.js";

/** Bekannte Modi. */
export const FIT_MODES = Object.freeze(["nearest", "ceil", "exact", "tight"]);

/** Modus ohne oder mit unbekanntem URL-Parameter. */
export const DEFAULT_FIT_MODE = "nearest";

/** Rand um die sichtbare Fläche in px (wie Menu/zoomToExtentPadding im Masterportal). */
export const EDGE_PADDING = 20;

/** Relative Toleranz beim Vergleich von Auflösungen (Rundung der Tabellenwerte). */
const EPSILON = 1e-9;

const isNumber = v => typeof v === "number" && Number.isFinite(v);

/**
 * Modus aus der Portal-URL.
 * @param {string} search Query der Portal-URL (location.search), mit oder ohne "?".
 * @returns {string} Ein Wert aus FIT_MODES; unbekannt oder fehlend: DEFAULT_FIT_MODE.
 */
export function readFitMode (search) {
    const value = new URLSearchParams(typeof search === "string" ? search : "").get("p2d2Fit");

    return FIT_MODES.includes(value) ? value : DEFAULT_FIT_MODE;
}

/**
 * Menübreite in px aus dem Wert von Menu/currentMenuWidth.
 * @param {unknown} width "25%", "400px", Anteil (0 bis 1) oder px als Zahl.
 * @param {number} mapWidth Kartenbreite in px (die Karte ist so breit wie das Fenster).
 * @returns {number|null} Breite in px oder null, wenn der Wert unlesbar ist.
 */
export function menuWidthPx (width, mapWidth) {
    if (isNumber(width) && width >= 0) {
        return width <= 1 ? width * mapWidth : width;
    }
    if (typeof width !== "string") {
        return null;
    }
    const match = (/^\s*(\d+(?:\.\d+)?)\s*(%|px)\s*$/).exec(width);

    if (!match) {
        return null;
    }
    return match[2] === "%" ? Number(match[1]) / 100 * mapWidth : Number(match[1]);
}

/**
 * Breite eines ausgeklappten Menüs, das über der Karte liegt.
 * Bevorzugt die gemessene Breite (nach Übergang oder Ziehen gesetzt), sonst die
 * konfigurierte Breite. Unter dem Breakpoint (isMobile) liegt kein Menü neben
 * der Karte.
 * @param {Object} rootGetters Root-Getter des Stores.
 * @param {"mainMenu"|"secondaryMenu"} side Menü.
 * @param {number} mapWidth Kartenbreite in px.
 * @returns {number} Breite in px (0, wenn eingeklappt oder unbekannt).
 */
export function menuOffset (rootGetters, side, mapWidth) {
    const main = side === "mainMenu";

    if (rootGetters.isMobile === true || rootGetters[main ? "Menu/mainExpanded" : "Menu/secondaryExpanded"] !== true) {
        return 0;
    }
    const measured = rootGetters[main ? "Menu/currentMainMenuOffsetWidth" : "Menu/currentSecondaryMenuOffsetWidth"];

    if (isNumber(measured) && measured > 0) {
        return measured;
    }
    const currentMenuWidth = rootGetters["Menu/currentMenuWidth"],
        configured = typeof currentMenuWidth === "function" ? menuWidthPx(currentMenuWidth(side), mapWidth) : null;

    return configured ?? 0;
}

/**
 * Padding der sichtbaren Fläche [oben, rechts, unten, links] in px.
 * @param {Object} rootGetters Root-Getter des Stores.
 * @param {number} mapWidth Kartenbreite in px.
 * @returns {number[]} Padding.
 */
export function menuPadding (rootGetters, mapWidth) {
    return [
        EDGE_PADDING,
        EDGE_PADDING + menuOffset(rootGetters, "secondaryMenu", mapWidth),
        EDGE_PADDING,
        EDGE_PADDING + menuOffset(rootGetters, "mainMenu", mapWidth)
    ];
}

/**
 * View-Zentrum, bei dem `center` in der Mitte der sichtbaren Fläche liegt.
 * @param {number[]} center Ziel in Kartenkoordinaten.
 * @param {number[]} padding [oben, rechts, unten, links] in px.
 * @param {number} resolution Auflösung der View.
 * @returns {number[]} View-Zentrum.
 */
export function shiftCenter (center, padding, resolution) {
    const [top, right, bottom, left] = padding;

    return [center[0] - (left - right) / 2 * resolution, center[1] + (top - bottom) / 2 * resolution];
}

/**
 * Feinste Stufe, deren Auflösung mindestens `resolution` ist; über der
 * gröbsten Stufe die gröbste.
 * @param {number} resolution Auflösung.
 * @param {number[]} resolutions Absteigend sortierte Auflösungen.
 * @returns {{stage: number, resolution: number}} Stufe.
 */
export function stageAtLeast (resolution, resolutions) {
    let stage = 0;

    for (let i = 0; i < resolutions.length; i++) {
        if (resolutions[i] >= resolution * (1 - EPSILON)) {
            stage = i;
        }
        else {
            break;
        }
    }
    return {stage, resolution: resolutions[stage]};
}

/**
 * Prüft ein Paar oder Quadrupel endlicher Zahlen.
 * @param {unknown} value Wert.
 * @param {number} length Erwartete Länge.
 * @returns {boolean} true bei gültigem Wert.
 */
function isNumbers (value, length) {
    return Array.isArray(value) && value.length === length && value.every(isNumber);
}

/**
 * Ziel der Fokussierung auf einen Extent.
 * @param {Object} args Eingaben.
 * @param {number[]} args.extent [minX, minY, maxX, maxY] in der View-Projektion.
 * @param {number[]} args.size Kartengröße [Breite, Höhe] in px.
 * @param {number[]} args.padding [oben, rechts, unten, links] in px.
 * @param {number[]} args.resolutions Absteigend sortierte Auflösungen der Portal-Tabelle.
 * @param {string} [args.mode] Ein Wert aus FIT_MODES (Standard DEFAULT_FIT_MODE).
 * @returns {{center: number[], resolution: number, stage: number, mode: string, fitResolution: number}}
 *   Ziel für view.animate und Maps/setInitialZoom; fitResolution ist die Auflösung,
 *   bei der die BBox genau in die sichtbare Fläche passt.
 */
export function fitTarget ({extent, size, padding, resolutions, mode = DEFAULT_FIT_MODE}) {
    if (!isNumbers(extent, 4) || !(extent[0] < extent[2]) || !(extent[1] < extent[3])) {
        throw new TypeError("fit: extent muss [minX, minY, maxX, maxY] mit min < max sein");
    }
    if (!isNumbers(size, 2) || !isNumbers(padding, 4) || padding.some(p => p < 0)) {
        throw new TypeError("fit: size [Breite, Höhe] und padding [oben, rechts, unten, links] (≥ 0) erwartet");
    }
    if (!Array.isArray(resolutions) || resolutions.length === 0 || !resolutions.every(r => isNumber(r) && r > 0)) {
        throw new TypeError("fit: resolutions fehlt");
    }
    if (!FIT_MODES.includes(mode)) {
        throw new TypeError(`fit: unbekannter Modus ${mode}`);
    }
    const width = size[0] - padding[1] - padding[3],
        height = size[1] - padding[0] - padding[2];

    if (!(width > 0) || !(height > 0)) {
        throw new TypeError("fit: keine sichtbare Fläche (padding ≥ size)");
    }
    const rx = (extent[2] - extent[0]) / width,
        ry = (extent[3] - extent[1]) / height,
        contain = Math.max(rx, ry),
        finest = resolutions[resolutions.length - 1];
    let target;

    if (mode === "nearest") {
        target = snapToStage(contain, resolutions);
    }
    else if (mode === "ceil") {
        target = stageAtLeast(contain, resolutions);
    }
    else if (mode === "tight") {
        target = stageAtLeast(Math.min(rx, ry), resolutions);
    }
    else {
        const resolution = Math.min(Math.max(contain, finest), resolutions[0]);

        target = {stage: snapToStage(resolution, resolutions).stage, resolution};
    }
    const middle = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];

    return {
        center: shiftCenter(middle, padding, target.resolution),
        resolution: target.resolution,
        stage: target.stage,
        mode,
        fitResolution: contain
    };
}
