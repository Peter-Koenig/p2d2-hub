<!--
SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
SPDX-License-Identifier: EUPL-1.2
p2d2: Werkzeugseite der Auswahl (Kommune, Kategorie) als Bildkacheln wie auf der
Standalone-Startseite (KommunenGrid.astro, Kategorien.astro). Nur Anzeige und
Klicks; Logik in js/ und store/actionsP2d2Selector.js.
Bilder: Feld image der Auswahl-Datei (Generator, resources/img/p2d2/); fehlt es
oder lädt es nicht, bleibt der dunkle Hintergrund der Kachel.
Hinweise nur bei Laden, Fehler und „keine Objekte“ (layerNoticeKey).
-->
<script>
import {mapActions, mapGetters} from "vuex";
import {layerNoticeKey} from "../js/selection.js";

export default {
    name: "P2d2Selector",
    data () {
        return {
            // Bildpfade, die nicht geladen werden konnten (Rückfall auf den Hintergrund).
            failedImages: {}
        };
    },
    computed: {
        ...mapGetters("Modules/P2d2Selector", [
            "selection", "loadStatus", "lastError", "kommuneSlug", "kategorieSlug",
            "stageStatus", "stageError", "layerStatus", "layerError"
        ]),

        /**
         * Hinweis zum Auswahl-Layer (loading, empty, error); sonst null.
         * @returns {string|null} Schlüssel unter layer.
         */
        layerNotice () {
            return layerNoticeKey(this.layerStatus);
        }
    },
    created () {
        if (this.loadStatus === "idle") {
            this.loadSelection();
        }
        if (this.stageStatus === "idle") {
            this.loadStage();
        }
    },
    methods: {
        ...mapActions("Modules/P2d2Selector", ["loadSelection", "loadStage", "select"]),

        /**
         * @param {string|null} image Bildpfad eines Eintrags.
         * @returns {boolean} true, wenn das Bild angezeigt werden soll.
         */
        showImage (image) {
            return typeof image === "string" && image !== "" && !this.failedImages[image];
        },

        /**
         * Merkt ein Bild, das nicht geladen werden konnte.
         * @param {string} image Bildpfad.
         * @returns {void}
         */
        imageFailed (image) {
            this.failedImages = {...this.failedImages, [image]: true};
        }
    }
};
</script>

<template>
    <div
        id="p2d2-selector"
        class="d-flex flex-column gap-3"
    >
        <p
            v-if="stageStatus === 'error'"
            class="small text-danger mb-0"
            role="alert"
        >
            {{ $t("additional:modules.p2d2Selector.stageFailed", {reason: stageError}) }}
        </p>

        <p
            v-if="layerNotice"
            class="small mb-0"
            :class="{'text-danger': layerNotice === 'error'}"
            :role="layerNotice === 'error' ? 'alert' : 'status'"
        >
            {{ $t(`additional:modules.p2d2Selector.layer.${layerNotice}`, {reason: layerError}) }}
        </p>

        <p
            v-if="loadStatus === 'loading' || loadStatus === 'idle'"
            class="small mb-0"
            role="status"
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
                <h2 class="h6 p2d2-heading">
                    {{ $t("additional:modules.p2d2Selector.kommunen") }}
                </h2>
                <div class="p2d2-grid">
                    <button
                        v-for="k in selection.kommunen"
                        :key="k.slug"
                        type="button"
                        class="p2d2-tile p2d2-tile-kommune"
                        :style="{'--p2d2-stripe': k.colorStripe}"
                        :aria-pressed="k.slug === kommuneSlug ? 'true' : 'false'"
                        @click="select({kommuneSlug: k.slug})"
                    >
                        <img
                            v-if="showImage(k.image)"
                            class="p2d2-tile-image"
                            :src="k.image"
                            alt=""
                            loading="lazy"
                            decoding="async"
                            @error="imageFailed(k.image)"
                        >
                        <span class="p2d2-tile-title">{{ k.title }}</span>
                    </button>
                </div>
            </section>
            <section>
                <h2 class="h6 p2d2-heading">
                    {{ $t("additional:modules.p2d2Selector.kategorien") }}
                </h2>
                <div class="p2d2-grid">
                    <button
                        v-for="c in selection.kategorien"
                        :key="c.slug"
                        type="button"
                        class="p2d2-tile p2d2-tile-kategorie"
                        :aria-pressed="c.slug === kategorieSlug ? 'true' : 'false'"
                        @click="select({kategorieSlug: c.slug})"
                    >
                        <img
                            v-if="showImage(c.image)"
                            class="p2d2-tile-image"
                            :src="c.image"
                            alt=""
                            loading="lazy"
                            decoding="async"
                            @error="imageFailed(c.image)"
                        >
                        <span class="p2d2-tile-title">{{ c.title }}</span>
                    </button>
                </div>
            </section>
        </template>
    </div>
</template>

<style scoped>
/*
 * Farben aus dem Standalone (Tailwind-Werte in KommunenGrid.astro und
 * Kategorien.astro): Kommunen Streifen colorStripe (Standard #FF6900), Verlauf
 * color-mix(colorStripe 35 %, schwarz), Schein rgba(255, 105, 0, 0.3);
 * Kategorien Streifen #0FF078, Verlauf #074220f5, Schein #0a6630.
 * Spalten nach der Breite des Selektors, nicht des Fensters (Container
 * Queries): eine, zwei ab 20.5rem, drei ab 31rem (je mindestens 10rem breit),
 * nie mehr als drei. Rechnung je Fensterbreite: README, Abschnitt „p2d2Selector“.
 */
#p2d2-selector {
    container-type: inline-size;
    container-name: p2d2-selector;
    --p2d2-tile-fallback-min-width: 13rem;
    --p2d2-tile-gap: 0.5rem;
    --p2d2-tile-min-height: 8rem;
    --p2d2-tile-max-height: 12rem;
    --p2d2-heading-gap: 1rem;
    --p2d2-tile-radius: 0.5rem;
    --p2d2-tile-fallback: #2a2a2a;
    --p2d2-stripe-height: 0.375rem;
    --p2d2-kommune-stripe: #ff6900;
    --p2d2-kommune-glow: rgba(255, 105, 0, 0.3);
    --p2d2-kategorie-stripe: #0ff078;
    --p2d2-kategorie-gradient: #074220f5;
    --p2d2-kategorie-glow: #0a6630;
    --p2d2-focus: #0d6efd;
}

/* Abstand Überschrift → Kacheln; der Abstand zwischen den Abschnitten bleibt gap-3. */
.p2d2-heading {
    margin-bottom: var(--p2d2-heading-gap);
}

/*
 * Rückfall für Browser ohne Container Queries: so viele Spalten, wie 13rem breit
 * passen (bei 25 % Menübreite drei Spalten erst ab 2752 px Fensterbreite).
 */
.p2d2-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--p2d2-tile-fallback-min-width), 1fr));
    gap: var(--p2d2-tile-gap);
}

/* min-width: 0 trifft immer zu, sobald Container Queries unterstützt werden. */
@container p2d2-selector (min-width: 0) {
    .p2d2-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}

@container p2d2-selector (min-width: 20.5rem) {
    .p2d2-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@container p2d2-selector (min-width: 31rem) {
    .p2d2-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }
}

/* Höhe wächst mit der Spaltenbreite (Bilder 4:3), begrenzt auf 8rem bis 12rem. */
.p2d2-tile {
    position: relative;
    display: flex;
    align-items: flex-end;
    aspect-ratio: 4 / 3;
    min-height: var(--p2d2-tile-min-height);
    max-height: var(--p2d2-tile-max-height);
    padding: 0;
    overflow: hidden;
    border: 0;
    border-radius: var(--p2d2-tile-radius);
    background: var(--p2d2-tile-fallback);
    color: #fff;
    text-align: left;
    cursor: pointer;
    transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.p2d2-tile-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
}

/* Verlauf nach unten */
.p2d2-tile::after {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
}

.p2d2-tile-kommune::after {
    /* Rückfall für Browser ohne color-mix */
    background: linear-gradient(to bottom, transparent 35%, rgba(0, 0, 0, 0.75) 85%);
    background: linear-gradient(
        to bottom,
        transparent 35%,
        color-mix(in oklch, var(--p2d2-stripe, var(--p2d2-kommune-stripe)) 35%, black) 85%
    );
}

.p2d2-tile-kategorie::after {
    background: linear-gradient(to bottom, transparent 25%, var(--p2d2-kategorie-gradient) 75%);
}

/* Farbstreifen oben */
.p2d2-tile::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2;
    height: var(--p2d2-stripe-height);
}

.p2d2-tile-kommune::before {
    background: var(--p2d2-stripe, var(--p2d2-kommune-stripe));
}

.p2d2-tile-kategorie::before {
    background: var(--p2d2-kategorie-stripe);
}

.p2d2-tile-title {
    position: relative;
    z-index: 1;
    display: -webkit-box;
    width: 100%;
    padding: 0.5rem 0.625rem;
    overflow: hidden;
    font-weight: 700;
    font-size: 0.875rem;
    line-height: 1.15;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}

/* Hover-Schein wie im Standalone */
.p2d2-tile-kommune:hover {
    box-shadow: 0 0 16px 2px var(--p2d2-kommune-glow);
}

.p2d2-tile-kategorie:hover {
    box-shadow: 0 0 16px 2px var(--p2d2-kategorie-glow);
}

/* Aktiv (aria-pressed): farbiger Schlagschatten in der Streifenfarbe plus Schein */
.p2d2-tile-kommune[aria-pressed="true"] {
    box-shadow:
        0 0 0 3px var(--p2d2-stripe, var(--p2d2-kommune-stripe)),
        0 0 16px 4px var(--p2d2-kommune-glow);
}

.p2d2-tile-kategorie[aria-pressed="true"] {
    box-shadow:
        0 0 0 3px var(--p2d2-kategorie-stripe),
        0 0 16px 4px var(--p2d2-kategorie-glow);
}

/* Fokus-Ring außerhalb des Schlagschattens (3px), damit beide sichtbar bleiben */
.p2d2-tile:focus-visible {
    outline: 2px solid var(--p2d2-focus);
    outline-offset: 5px;
}

@media (prefers-reduced-motion: reduce) {
    .p2d2-tile {
        transition: none;
    }
}
</style>
