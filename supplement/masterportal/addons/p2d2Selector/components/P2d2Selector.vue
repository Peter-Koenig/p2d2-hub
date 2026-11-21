<!--
SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
SPDX-License-Identifier: EUPL-1.2
p2d2: Werkzeugseite der Auswahl (Kommune, Kategorie) als Kachelmatrizen.
Nur Anzeige und Klicks; Logik in js/selection.js und store/actionsP2d2Selector.js.
Kacheln sind Textkacheln mit Farbstreifen (Kategorie-Bilder liegen nicht im Supplement).
-->
<script>
import {mapActions, mapGetters} from "vuex";

export default {
    name: "P2d2Selector",
    computed: {
        ...mapGetters("Modules/P2d2Selector", [
            "selection", "loadStatus", "lastError", "kommuneSlug", "kategorieSlug", "selectedKommune", "selectedKategorie"
        ]),

        /**
         * Text der Auswahlzeile.
         * @returns {string} "Kommune · Kategorie", nur eine Hälfte oder leer.
         */
        summary () {
            return [this.selectedKommune?.title, this.selectedKategorie?.title].filter(Boolean).join(" · ");
        }
    },
    created () {
        if (this.loadStatus === "idle") {
            this.loadSelection();
        }
    },
    methods: {
        ...mapActions("Modules/P2d2Selector", ["loadSelection", "select"])
    }
};
</script>

<template>
    <div
        id="p2d2-selector"
        class="d-flex flex-column gap-3"
    >
        <div
            class="p2d2-summary"
            aria-live="polite"
        >
            <div class="small text-secondary">
                {{ $t("additional:modules.p2d2Selector.current") }}
            </div>
            <div class="fw-bold">
                {{ summary || $t("additional:modules.p2d2Selector.none") }}
            </div>
        </div>

        <p
            v-if="loadStatus === 'loading' || loadStatus === 'idle'"
            class="small mb-0"
        >
            {{ $t("additional:modules.p2d2Selector.loading") }}
        </p>

        <div
            v-else-if="loadStatus === 'error'"
            class="d-flex flex-column gap-2"
            role="alert"
        >
            <p class="small text-danger mb-0">
                {{ $t("additional:modules.p2d2Selector.failed", {reason: lastError}) }}
            </p>
            <button
                type="button"
                class="btn btn-secondary btn-sm align-self-start"
                @click="loadSelection"
            >
                {{ $t("additional:modules.p2d2Selector.retry") }}
            </button>
        </div>

        <template v-else-if="selection">
            <section>
                <h2 class="h6">
                    {{ $t("additional:modules.p2d2Selector.kommunen") }}
                </h2>
                <div class="p2d2-grid">
                    <button
                        v-for="k in selection.kommunen"
                        :key="k.slug"
                        type="button"
                        class="p2d2-tile"
                        :class="{'p2d2-tile-selected': k.slug === kommuneSlug}"
                        :style="{borderTopColor: k.colorStripe}"
                        :aria-pressed="k.slug === kommuneSlug ? 'true' : 'false'"
                        @click="select({kommuneSlug: k.slug})"
                    >
                        {{ k.title }}
                    </button>
                </div>
            </section>
            <section>
                <h2 class="h6">
                    {{ $t("additional:modules.p2d2Selector.kategorien") }}
                </h2>
                <div class="p2d2-grid">
                    <button
                        v-for="c in selection.kategorien"
                        :key="c.slug"
                        type="button"
                        class="p2d2-tile"
                        :class="{'p2d2-tile-selected': c.slug === kategorieSlug}"
                        :aria-pressed="c.slug === kategorieSlug ? 'true' : 'false'"
                        @click="select({kategorieSlug: c.slug})"
                    >
                        {{ c.title }}
                    </button>
                </div>
            </section>
        </template>
    </div>
</template>

<style scoped>
.p2d2-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
}

.p2d2-tile {
    min-height: 3rem;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-top: 4px solid #ccc;
    border-radius: 0.25rem;
    background: #fff;
    color: inherit;
    text-align: center;
    cursor: pointer;
}

.p2d2-tile:hover {
    background: #f4f4f4;
}

.p2d2-tile:focus-visible {
    outline: 2px solid #0d6efd;
    outline-offset: 2px;
}

.p2d2-tile-selected {
    border-color: #ff6900;
    background: #fff1e6;
    font-weight: bold;
}
</style>
