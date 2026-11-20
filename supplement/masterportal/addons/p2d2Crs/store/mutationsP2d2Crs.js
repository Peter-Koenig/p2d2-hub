// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Mutationen des Add-ons p2d2Crs

export default {
    setLocalCrs (state, code) {
        state.localCrs = code;
    },
    setActiveCrs (state, code) {
        state.activeCrs = code;
    },
    setLastError (state, reason) {
        state.lastError = reason;
    }
};
