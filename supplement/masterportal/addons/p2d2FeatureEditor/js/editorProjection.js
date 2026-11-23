// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Projektion für die Editor-URL
//
// Der Editor bekommt immer das lokale CRS (UTM), auch wenn die Karte über das
// Add-on p2d2Crs gerade in EPSG:3857 steht; so macht es auch der Standalone
// (src/utils/feature-popup-handler.ts, projection: localCRS). Ohne p2d2Crs
// gilt die Projektion der View.

/**
 * Wählt die Projektion für den Parameter projection der Editor-URL.
 * @param {{localCrs: (string|null|undefined), viewProjection: string}} args Lokales CRS aus Modules/P2d2Crs, Projektion der View.
 * @returns {string} EPSG-Code.
 */
export function editorProjection ({localCrs, viewProjection}) {
    return typeof localCrs === "string" && localCrs !== "" ? localCrs : viewProjection;
}
