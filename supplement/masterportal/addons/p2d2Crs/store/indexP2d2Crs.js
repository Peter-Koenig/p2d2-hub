// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Vuex-Modul des Add-ons p2d2Crs (Modules/P2d2Crs)

import state from "./stateP2d2Crs.js";
import getters from "./gettersP2d2Crs.js";
import mutations from "./mutationsP2d2Crs.js";
import {createActions} from "./actionsP2d2Crs.js";
import runtime from "../js/runtime.js";

export default {
    namespaced: true,
    state: {...state},
    getters,
    mutations,
    actions: createActions(runtime)
};
