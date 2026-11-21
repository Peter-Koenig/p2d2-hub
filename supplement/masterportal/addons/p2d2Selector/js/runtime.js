// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Laufzeit-Abhängigkeiten des Add-ons p2d2Selector
//
// Kein Masterportal-Import: Das Add-on liest nur die Auswahl-Datei. Der
// Pfad ist relativ zur Portal-Seite, wie portalConf und layerConf in
// config.js und die Editor-Konfiguration des p2d2FeatureEditor.

export default {
    url: "./resources/p2d2-selection.json",
    fetch: (url, options) => window.fetch(url, options),

    /**
     * Hook für die Weitergabe der Auswahl (Karte, Layer, Zoom folgen später).
     * Standard: nichts tun.
     * @returns {void}
     */
    applySelection: () => undefined
};
