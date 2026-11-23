// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Getter des Add-ons p2d2Crs

export default {
    type: state => state.type,
    name: state => state.name,
    icon: state => state.icon,
    localCrs: state => state.localCrs,
    genericCrs: state => state.genericCrs,
    activeCrs: state => state.activeCrs,
    lastError: state => state.lastError
};
