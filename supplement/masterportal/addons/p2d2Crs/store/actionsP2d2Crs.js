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
 * @returns {{toggle: function(Object): void, setLocalCrs: function(Object, string): boolean, activateLocal: function(Object): Object}} Aktionen.
 */
export function createActions ({swapView, getMap, View, ensureProjection, baseExtent}) {
    /**
     * Tauscht die View auf target und hält activeCrs/lastError nach.
     * @param {Object} context Store-Kontext.
     * @param {string} target Zielprojektion.
     * @param {{dropExtent?: boolean}} [options] Weiter an swapView.
     * @returns {{ok: boolean, reason?: string, unchanged?: boolean, rebuilt?: boolean}} Ergebnis von swapView.
     */
    function switchTo ({commit, dispatch, rootGetters}, target, {dropExtent = false} = {}) {
        const result = swapView({
            target,
            map: getMap(),
            View,
            ensureProjection,
            getters: rootGetters,
            commit: (type, payload) => commit(type, payload, {root: true}),
            dispatch: (type, payload) => dispatch(type, payload, {root: true}),
            baseExtent: baseExtent(rootGetters),
            dropExtent
        });

        if (result.ok) {
            commit("setActiveCrs", target);
            commit("setLastError", null);
        }
        else {
            commit("setLastError", result.reason);
            console.error("[p2d2Crs] Umschalten nicht möglich:", result.reason, result.error ?? "");
        }
        return result;
    }

    return {
        /**
         * Schaltet zwischen lokalem und generischem CRS um.
         * @param {Object} context Store-Kontext.
         * @returns {void}
         */
        toggle (context) {
            const target = targetCrs(context.state);

            if (!target || context.rootGetters["Maps/mode"] !== "2D") {
                return;
            }
            switchTo(context, target);
        },

        /**
         * Setzt das lokale CRS (Kommunenwahl). Registriert die UTM-Zone bei
         * Bedarf; die aktive View bleibt unverändert.
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
        },

        /**
         * Schaltet die View auf das lokale CRS, auch wenn das generische aktiv
         * ist (Kommunenwahl wie im Standalone). Die View danach hat keinen
         * Extent (dropExtent): Ohne konfigurierten extent setzt die
         * masterportalapi für die Start-View ihren Standard-Extent, der das
         * Zentrum klemmen würde. Bei gleicher Projektion und View ohne Extent
         * tauscht swapView nichts aus. Läuft synchron; der Rückgabewert kommt
         * über Vuex-dispatch als Promise an, die Wirkung steht sofort im Store.
         * @param {Object} context Store-Kontext.
         * @returns {{ok: boolean, reason?: string, unchanged?: boolean, rebuilt?: boolean}} Ergebnis.
         */
        activateLocal (context) {
            const {state, commit, rootGetters} = context;

            if (typeof state.localCrs !== "string" || state.localCrs === "") {
                commit("setLastError", "local");
                return {ok: false, reason: "local"};
            }
            if (rootGetters["Maps/mode"] !== "2D") {
                commit("setLastError", "mode");
                return {ok: false, reason: "mode"};
            }
            return switchTo(context, state.localCrs, {dropExtent: true});
        }
    };
}
