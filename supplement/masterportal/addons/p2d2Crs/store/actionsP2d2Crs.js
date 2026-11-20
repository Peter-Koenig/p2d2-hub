// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Aktionen des Add-ons p2d2Crs
//
// createActions bekommt die Laufzeit-Abhängigkeiten (js/runtime.js), damit die
// Aktionen ohne Masterportal testbar sind.

import {isUtm} from "../js/utm.js";
import {targetCrs} from "../js/viewSwap.js";

/**
 * Erzeugt die Store-Aktionen.
 * @param {Object} runtime Laufzeit.
 * @param {Function} runtime.swapView Siehe js/viewSwap.js.
 * @param {function(): Object} runtime.getMap Liefert die 2D-Karte.
 * @param {Function} runtime.View View-Klasse.
 * @param {function(string): boolean} runtime.ensureProjection Projektion sicherstellen.
 * @param {function(Object): ({extent: number[], epsg: string}|undefined)} runtime.baseExtent Extent der Portal-Konfiguration aus den Root-Gettern.
 * @returns {{toggle: function(Object): void, setLocalCrs: function(Object, string): boolean}} Aktionen.
 */
export function createActions ({swapView, getMap, View, ensureProjection, baseExtent}) {
    return {
        /**
         * Schaltet zwischen lokalem und generischem CRS um.
         * @param {Object} context Store-Kontext.
         * @returns {void}
         */
        toggle ({state, commit, dispatch, rootGetters}) {
            const target = targetCrs(state);

            if (!target || rootGetters["Maps/mode"] !== "2D") {
                return;
            }
            const result = swapView({
                target,
                map: getMap(),
                View,
                ensureProjection,
                getters: rootGetters,
                commit: (type, payload) => commit(type, payload, {root: true}),
                dispatch: (type, payload) => dispatch(type, payload, {root: true}),
                baseExtent: baseExtent(rootGetters)
            });

            if (result.ok) {
                commit("setActiveCrs", target);
                commit("setLastError", null);
            }
            else {
                commit("setLastError", result.reason);
                console.error("[p2d2Crs] Umschalten nicht möglich:", result.reason, result.error ?? "");
            }
        },

        /**
         * Setzt das lokale CRS (für die Kommunenwahl in Phase 4). Registriert
         * die UTM-Zone bei Bedarf; die aktive View bleibt unverändert.
         * @param {Object} context Store-Kontext.
         * @param {string} code EPSG-Code einer UTM-Zone.
         * @returns {boolean} true, wenn gesetzt.
         */
        setLocalCrs ({commit}, code) {
            if (!isUtm(code) || !ensureProjection(code)) {
                return false;
            }
            commit("setLocalCrs", code);
            return true;
        }
    };
}
