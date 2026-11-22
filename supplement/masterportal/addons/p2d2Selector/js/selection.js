// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Reine Funktionen der Auswahl (Kommune, Kategorie) des Add-ons p2d2Selector
//
// Ohne Masterportal-Importe, ohne Seiteneffekte. Eingabe ist der Inhalt von
// portal/resources/p2d2-selection.json (Version 1, vom Generator erzeugt; die
// Reihenfolge der Einträge ist dort festgelegt und wird nicht verändert).

/** Unterstützte Version der Auswahl-Datei. */
export const SELECTION_VERSION = 1;

const isObject = v => typeof v === "object" && v !== null && !Array.isArray(v),
    isString = v => typeof v === "string",
    isNumber = v => typeof v === "number" && Number.isFinite(v),
    PROJECTION = /^EPSG:\d+$/,
    // Relativ zur Portal-Seite, nur unter resources/img/, kein "..", Bildendung.
    IMAGE_PATH = /^resources\/img\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(?:jpg|jpeg|png|webp)$/;

/**
 * Prüft map.extent einer Kommune ([minLon, minLat, maxLon, maxLat], EPSG:4326).
 * Gleiche Regeln im Generator (scripts/generate-masterportal-selection.mjs).
 * @param {unknown} extent Extent.
 * @param {unknown} center map.center ([lon, lat]); nur geprüft, wenn es zwei Zahlen sind.
 * @returns {string[]} Meldungen ohne Pfad; leer, wenn gültig.
 */
export function extentErrors (extent, center) {
    if (!Array.isArray(extent) || extent.length !== 4 || !extent.every(isNumber)) {
        return ["muss vier Zahlen [minLon, minLat, maxLon, maxLat] enthalten"];
    }
    const [minLon, minLat, maxLon, maxLat] = extent,
        errors = [];

    if (!(minLon < maxLon)) {
        errors.push("minLon muss kleiner als maxLon sein");
    }
    if (!(minLat < maxLat)) {
        errors.push("minLat muss kleiner als maxLat sein");
    }
    if ([minLon, maxLon].some(v => Math.abs(v) > 180) || [minLat, maxLat].some(v => Math.abs(v) > 90)) {
        errors.push("liegt außerhalb des Wertebereichs (Länge ±180, Breite ±90)");
    }
    if (errors.length === 0 && Array.isArray(center) && center.length === 2 && center.every(isNumber)) {
        const [lon, lat] = center;

        if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) {
            errors.push("center liegt außerhalb von map.extent");
        }
    }
    return errors;
}

/**
 * Prüft das Feld image eines Eintrags (fehlt, null oder Pfad unter resources/img/).
 * @param {Object} entry Eintrag.
 * @param {string} where Pfad für Meldungen.
 * @param {string[]} errors Fehlerliste (wird ergänzt).
 * @returns {void}
 */
function checkImage (entry, where, errors) {
    if (entry.image === undefined || entry.image === null) {
        return;
    }
    if (!isString(entry.image) || !IMAGE_PATH.test(entry.image) || entry.image.split("/").includes("..")) {
        errors.push(`${where}.image muss null oder ein relativer Bildpfad unter resources/img/ sein`);
    }
}

/**
 * Prüft die Einträge einer Liste: Array, nichtleer, Slug und Titel Strings, Slug eindeutig.
 * @param {unknown} list Liste.
 * @param {string} name Name der Liste für Meldungen.
 * @param {string[]} errors Fehlerliste (wird ergänzt).
 * @returns {Object[]} Die Einträge, die Objekte sind.
 */
function checkList (list, name, errors) {
    if (!Array.isArray(list) || list.length === 0) {
        errors.push(`${name} muss ein nichtleeres Array sein`);
        return [];
    }
    const seen = new Set();

    list.forEach((entry, i) => {
        if (!isObject(entry)) {
            errors.push(`${name}[${i}] muss ein Objekt sein`);
            return;
        }
        if (!isString(entry.slug) || entry.slug === "") {
            errors.push(`${name}[${i}].slug muss ein nichtleerer String sein`);
        }
        else if (seen.has(entry.slug)) {
            errors.push(`${name}[${i}].slug "${entry.slug}" kommt mehrfach vor`);
        }
        else {
            seen.add(entry.slug);
        }
        if (!isString(entry.title) || entry.title === "") {
            errors.push(`${name}[${i}].title muss ein nichtleerer String sein`);
        }
    });
    return list.filter(isObject);
}

/**
 * Prüft eine Kommune (ohne Slug und Titel, siehe checkList).
 * @param {Object} k Kommune.
 * @param {string} where Pfad für Meldungen.
 * @param {string[]} types containerType-Werte der Kategorien.
 * @param {string[]} errors Fehlerliste (wird ergänzt).
 * @returns {void}
 */
function checkKommune (k, where, types, errors) {
    if (!isString(k.wpName) || k.wpName === "") {
        errors.push(`${where}.wpName muss ein nichtleerer String sein`);
    }
    const map = k.map;

    if (!isObject(map)) {
        errors.push(`${where}.map muss ein Objekt sein`);
    }
    else {
        if (!Array.isArray(map.center) || map.center.length !== 2 || !map.center.every(isNumber)) {
            errors.push(`${where}.map.center muss [Zahl, Zahl] sein`);
        }
        if (!isNumber(map.zoom)) {
            errors.push(`${where}.map.zoom muss eine Zahl sein`);
        }
        if (!isString(map.projection) || !PROJECTION.test(map.projection)) {
            errors.push(`${where}.map.projection muss "EPSG:<Ziffern>" sein`);
        }
        if (map.extent !== undefined) {
            for (const message of extentErrors(map.extent, map.center)) {
                errors.push(message.startsWith("center ") ? `${where}.map.${message}` : `${where}.map.extent ${message}`);
            }
        }
    }
    checkImage(k, where, errors);
    if (!isObject(k.osmAdminLevel)) {
        errors.push(`${where}.osmAdminLevel muss ein Objekt sein`);
        return;
    }
    for (const type of types) {
        if (!Number.isInteger(k.osmAdminLevel[type])) {
            errors.push(`${where}.osmAdminLevel.${type} muss eine ganze Zahl sein`);
        }
    }
}

/**
 * Prüft den Inhalt der Auswahl-Datei. Wirft nie; unbekannte Zusatzfelder werden ignoriert.
 * @param {unknown} json Geparster Inhalt.
 * @returns {{ok: boolean, errors: string[]}} Ergebnis mit Meldungen.
 */
export function validateSelection (json) {
    const errors = [];

    if (!isObject(json)) {
        return {ok: false, errors: ["Auswahl muss ein Objekt sein"]};
    }
    if (json.version !== SELECTION_VERSION) {
        errors.push(`version muss ${SELECTION_VERSION} sein`);
    }
    const kommunen = checkList(json.kommunen, "kommunen", errors),
        kategorien = checkList(json.kategorien, "kategorien", errors),
        types = [...new Set(kategorien.map(k => k.containerType))];

    kategorien.forEach((k, i) => {
        if (!isString(k.containerType) || k.containerType === "") {
            errors.push(`kategorien[${i}].containerType muss ein nichtleerer String sein`);
        }
        checkImage(k, `kategorien[${i}]`, errors);
    });
    kommunen.forEach((k, i) => checkKommune(k, `kommunen[${i}]`, types.filter(isString), errors));
    return {ok: errors.length === 0, errors};
}

/**
 * @param {Object|null} selection Auswahl-Datei.
 * @param {string} slug Slug.
 * @returns {Object|null} Kommune oder null.
 */
export function findKommune (selection, slug) {
    return selection?.kommunen?.find(k => k.slug === slug) ?? null;
}

/**
 * @param {Object|null} selection Auswahl-Datei.
 * @param {string} slug Slug.
 * @returns {Object|null} Kategorie oder null.
 */
export function findKategorie (selection, slug) {
    return selection?.kategorien?.find(k => k.slug === slug) ?? null;
}

/**
 * Wendet einen Klick auf eine Kachel an: gleicher Slug hebt die Auswahl auf,
 * ein anderer gültiger Slug setzt sie, ein unbekannter lässt den Zustand
 * unverändert. Eine nicht übergebene Dimension bleibt unberührt.
 * @param {{kommuneSlug: (string|null), kategorieSlug: (string|null)}} state Aktuelle Auswahl.
 * @param {{kommuneSlug?: string, kategorieSlug?: string}} click Geklickte Slugs.
 * @param {Object} selection Auswahl-Datei.
 * @returns {{kommuneSlug: (string|null), kategorieSlug: (string|null)}} Neuer Zustand (neues Objekt).
 */
export function toggleSelection (state, click, selection) {
    const next = {kommuneSlug: state.kommuneSlug ?? null, kategorieSlug: state.kategorieSlug ?? null},
        apply = (key, slug, find) => {
            if (slug === undefined) {
                return;
            }
            if (slug === next[key]) {
                next[key] = null;
            }
            else if (find(selection, slug)) {
                next[key] = slug;
            }
        };

    apply("kommuneSlug", click?.kommuneSlug, findKommune);
    apply("kategorieSlug", click?.kategorieSlug, findKategorie);
    return next;
}

/**
 * Kennung einer Auswahl (Vergleich in applySelection, Debug-Ausgabe).
 * @param {{kommuneSlug: (string|null), kategorieSlug: (string|null)}} state Auswahl.
 * @returns {string} "<kommune>|<kategorie>", leer wenn beide fehlen.
 */
export function selectionSignature ({kommuneSlug = null, kategorieSlug = null} = {}) {
    return kommuneSlug === null && kategorieSlug === null ? "" : `${kommuneSlug ?? ""}|${kategorieSlug ?? ""}`;
}
