// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Loader des dynamischen Auswahl-Layers (Add-on p2d2Selector)
//
// Reines ES-Modul ohne Imports. fetch und das Lesen der Features werden
// injiziert. Die Quelle ist eine ol/source/Vector (setLoader, refresh, clear,
// addFeatures); OpenLayers ruft den Loader beim nächsten Rendern mit der
// aktuellen View-Projektion auf.
//
// Vertrag mit ol/source/Vector (10.6 und 10.10): Der Loader gibt nichts zurück
// und ruft success oder failure genau einmal. Gibt er ein Promise zurück, fügt
// OpenLayers ab 10.10 die Features selbst ein (source/Vector.js loadFeatures).
//
// Jeder Loader-Aufruf bricht den vorherigen ab und bekommt ein neues Token;
// Antworten mit veraltetem Token werden verworfen. Das gilt über Auswahl-
// wechsel hinweg und für das Neuladen nach einem Projektionswechsel.
//
// Tests: src/tests/masterportal-selector-layer.test.ts

/**
 * @param {unknown} projection OL-Projektion oder Code.
 * @returns {string} EPSG-Code.
 */
function projectionCode (projection) {
    return typeof projection?.getCode === "function" ? projection.getCode() : String(projection);
}

/**
 * Loader ohne Request (keine Auswahl).
 * @param {*} extent Extent.
 * @param {*} resolution Auflösung.
 * @param {*} projection Projektion.
 * @param {function(Array): void} success Erfolg.
 * @returns {void}
 */
function emptyLoader (extent, resolution, projection, success) {
    success([]);
}

/**
 * Erzeugt die Steuerung des Auswahl-Layers.
 * @param {Object} deps Abhängigkeiten.
 * @param {Function} deps.fetch Wie window.fetch.
 * @param {function(Object, *): Array} deps.readFeatures GeoJSON lesen (json, featureProjection) → Features.
 * @param {function(string, Object=): void} [deps.debug] Debug-Ausgabe.
 * @returns {{load: function(Object, (string|null), function(Object): void): void}} Steuerung.
 */
export function createLayerControl ({fetch, readFeatures, debug = () => undefined}) {
    let token = 0,
        controller = null;

    /**
     * Macht laufende Aufrufe ungültig und bricht ihren Request ab.
     * @returns {void}
     */
    function cancel () {
        token += 1;
        if (controller) {
            controller.abort();
            controller = null;
        }
    }

    /**
     * Loader für eine URL.
     * @param {Object} source Vektorquelle.
     * @param {string} url Request-URL.
     * @param {function(Object): void} onStatus Statusmeldung.
     * @returns {Function} Loader (extent, resolution, projection, success, failure).
     */
    function createLoader (source, url, onStatus) {
        return function loader (extent, resolution, projection, success, failure) {
            cancel();
            const mine = token,
                ctrl = new AbortController(),
                code = projectionCode(projection),
                isCurrent = () => mine === token;
            let settled = false;

            const finish = (ok, features = []) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    if (controller === ctrl) {
                        controller = null;
                    }
                    if (ok) {
                        success(features);
                    }
                    else {
                        failure();
                    }
                },
                fail = message => {
                    finish(false);
                    onStatus({status: "error", error: message});
                };

            controller = ctrl;
            onStatus({status: "loading"});
            debug("request", {url, projection: code});

            (async () => {
                const response = await fetch(url, {signal: ctrl.signal});

                debug("response", {status: response.status, current: isCurrent()});
                if (!isCurrent()) {
                    finish(true);
                    return;
                }
                if (!response.ok) {
                    fail(`HTTP ${response.status}`);
                    return;
                }
                const json = await response.json();

                if (!isCurrent()) {
                    finish(true);
                    return;
                }
                if (json?.type !== "FeatureCollection" || !Array.isArray(json.features)) {
                    fail("Antwort ist keine FeatureCollection");
                    return;
                }
                const features = readFeatures(json, projection);

                source.addFeatures(features);
                finish(true, features);
                onStatus({status: features.length > 0 ? "ready" : "empty", count: features.length});
                debug("features", {count: features.length, projection: code});
            })().catch(error => {
                // Abbruch (AbortError) kommt nur über cancel(), das Token ist dann veraltet.
                if (!isCurrent()) {
                    finish(true);
                    return;
                }
                fail(error?.message ?? String(error));
            });
        };
    }

    return {
        /**
         * Setzt den Inhalt des Layers. null leert ihn ohne Request.
         * @param {Object} source Vektorquelle des Auswahl-Layers.
         * @param {string|null} url Request-URL oder null.
         * @param {function(Object): void} onStatus Statusmeldung {status, count?, error?}.
         * @returns {void}
         */
        load (source, url, onStatus) {
            cancel();
            if (url === null) {
                source.setLoader(emptyLoader);
                source.clear();
                onStatus({status: "idle"});
                return;
            }
            source.setLoader(createLoader(source, url, onStatus));
            source.refresh();
            onStatus({status: "loading"});
        }
    };
}
