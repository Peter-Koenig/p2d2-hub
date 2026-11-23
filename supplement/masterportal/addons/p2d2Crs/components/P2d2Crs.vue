<!--
SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
SPDX-License-Identifier: EUPL-1.2
p2d2: Werkzeugseite des Projektions-Switch (nur Anzeige und Umschalter;
Logik in js/viewSwap.js und store/actionsP2d2Crs.js)
-->
<script>
import {mapActions, mapGetters} from "vuex";
import {crsLabel} from "../js/utm.js";
import {targetCrs} from "../js/viewSwap.js";

export default {
    name: "P2d2Crs",
    computed: {
        ...mapGetters("Modules/P2d2Crs", ["activeCrs", "localCrs", "genericCrs", "lastError"]),
        ...mapGetters("Maps", ["mode"]),

        /**
         * Ziel des Umschalters, null ohne lokales CRS.
         * @returns {string|null} EPSG-Code.
         */
        target () {
            return targetCrs({activeCrs: this.activeCrs, localCrs: this.localCrs, genericCrs: this.genericCrs});
        },

        /**
         * Umschalten nur in 2D und mit lokalem CRS.
         * @returns {boolean} true, wenn der Button gesperrt ist.
         */
        disabled () {
            return this.mode !== "2D" || this.target === null;
        }
    },
    methods: {
        ...mapActions("Modules/P2d2Crs", ["toggle"]),
        crsLabel
    }
};
</script>

<template>
    <div
        id="p2d2-crs"
        class="d-flex flex-column gap-3"
    >
        <div>
            <div class="small text-secondary">
                {{ $t("additional:modules.p2d2Crs.active") }}
            </div>
            <div class="fw-bold">
                {{ crsLabel(activeCrs) }}
            </div>
            <div class="small">
                {{ activeCrs }}
            </div>
        </div>
        <button
            type="button"
            class="btn btn-primary"
            :disabled="disabled"
            @click="toggle"
        >
            <i
                class="bi-arrow-left-right me-2"
                role="img"
            />
            {{ target ? $t("additional:modules.p2d2Crs.switchTo", {label: crsLabel(target)}) : $t("additional:modules.p2d2Crs.noLocal") }}
        </button>
        <p
            v-if="mode !== '2D'"
            class="small mb-0"
        >
            {{ $t("additional:modules.p2d2Crs.only2d") }}
        </p>
        <p
            v-if="lastError"
            class="small text-danger mb-0"
        >
            {{ $t("additional:modules.p2d2Crs.failed", {reason: lastError}) }}
        </p>
    </div>
</template>
