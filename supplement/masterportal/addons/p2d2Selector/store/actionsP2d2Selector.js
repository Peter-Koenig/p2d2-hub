// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Aktionen des Add-ons p2d2Selector
//
// createActions bekommt die Laufzeit-Abhängigkeiten (js/runtime.js), damit die
// Aktionen ohne Masterportal testbar sind.

import {selectionSignature, toggleSelection, validateSelection, findKategorie, findKommune} from "../js/selection.js";

/**
 * Erzeugt die Store-Aktionen.
 * @param {Object} runtime Laufzeit.
 * @param {string} runtime.url Pfad der Auswahl-Datei.
 * @param {Function} runtime.fetch Wie window.fetch.
 * @param {Function} [runtime.applySelection] Hook (signature, {kommuneSlug, kategorieSlug, kommune, kategorie}); Standard: nichts.
 * @returns {{loadSelection: function(Object): Promise<void>, select: function(Object, Object): void}} Aktionen.
 */
export function createActions ({url, fetch, applySelection = () => undefined}) {
    return {
        /**
         * Lädt und prüft die Auswahl-Datei. Fehler setzen loadStatus "error" und
         * lastError, sie werden nicht geworfen.
         * @param {Object} context Store-Kontext.
         * @returns {Promise<void>} Fertig, sobald der Status feststeht.
         */
        async loadSelection ({state, commit}) {
            if (state.loadStatus === "loading") {
                return;
            }
            commit("setLoadStatus", "loading");
            commit("setLastError", null);
            try {
                const response = await fetch(url, {cache: "no-cache"});

                if (!response.ok) {
                    throw new Error(`${url}: HTTP ${response.status}`);
                }
                const json = await response.json(),
                    result = validateSelection(json);

                if (!result.ok) {
                    throw new Error(`${url}: ungültig (${result.errors.slice(0, 3).join("; ")})`);
                }
                commit("setSelection", json);
                commit("setLoadStatus", "ready");
            }
            catch (error) {
                commit("setLastError", error?.message ?? String(error));
                commit("setLoadStatus", "error");
                console.error("[p2d2Selector] Auswahl nicht ladbar:", error);
            }
        },

        /**
         * Wendet einen Kachelklick an. Nur bei geänderter Auswahl wird der Hook
         * mit der neuen Signatur gerufen.
         * @param {Object} context Store-Kontext.
         * @param {{kommuneSlug?: string, kategorieSlug?: string}} click Geklickte Slugs.
         * @returns {void}
         */
        select ({state, commit}, click) {
            if (!state.selection) {
                return;
            }
            const next = toggleSelection(state, click, state.selection);

            if (next.kommuneSlug === state.kommuneSlug && next.kategorieSlug === state.kategorieSlug) {
                return;
            }
            commit("setSelected", next);
            applySelection(selectionSignature(next), {
                ...next,
                kommune: findKommune(state.selection, next.kommuneSlug),
                kategorie: findKategorie(state.selection, next.kategorieSlug)
            });
        }
    };
}
