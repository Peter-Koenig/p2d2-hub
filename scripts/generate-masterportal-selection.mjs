// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Generator für supplement/masterportal/portal/resources/p2d2-selection.json
//
// Liest src/content/kommunen und src/content/kategorien, validiert das
// Frontmatter mit den Schemata aus @p2d2/core und schreibt die Auswahl-Datei,
// die das Masterportal-Add-on später allein liest (das Add-on importiert
// @p2d2/core nicht). Den OSM-Admin-Level je Kommune und containerType
// berechnet @p2d2/core (getOsmAdminLevel); hier wird nichts umgerechnet.
//
// Aufruf (siehe package.json, baut vorher @p2d2/core):
//   npm run generate:masterportal-selection             Datei schreiben
//   npm run generate:masterportal-selection -- --check  Abweichung -> Exit 1

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import matter from "gray-matter";
import {
  getOsmAdminLevel,
  kategorieSchema,
  kommuneSchema,
} from "@p2d2/core";
import { isUtm } from "../supplement/masterportal/addons/p2d2Crs/js/utm.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const KOMMUNEN_DIR = join(ROOT, "src/content/kommunen");
const KATEGORIEN_DIR = join(ROOT, "src/content/kategorien");
export const OUTPUT_FILE = join(
  ROOT,
  "supplement/masterportal/portal/resources/p2d2-selection.json",
);

/** Version des Dateiformats; bei inkompatiblen Änderungen erhöhen. */
export const SELECTION_VERSION = 1;

/** Sortierwert für Einträge ohne `order`. */
const ORDER_FALLBACK = 999;

/**
 * Darstellungsgrenze der Standalone-Kachelmatrix: `KategorienGrid.astro`
 * zeigt nach der Sortierung nur die ersten 12 Kategorien. Die Auswahl im
 * Masterportal folgt derselben Grenze.
 */
export const MAX_KATEGORIEN = 12;

const byOrderThenSlug = (a, b) =>
  a.order - b.order || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/** Fehlermeldung eines Zod-Ergebnisses in einer Zeile. */
const issues = (error) =>
  error.issues.map((i) => `${i.path.join(".") || "(Wurzel)"}: ${i.message}`).join("; ");

/**
 * Prüft einen Content-Eintrag und bringt ihn in die Form der Auswahl.
 * @param {{slug: string, data: object}} entry Slug und rohes Frontmatter.
 */
function parseKommune(entry) {
  const label = `Kommune "${entry.slug}"`;
  const parsed = kommuneSchema.safeParse(entry.data);
  if (!parsed.success) {
    throw new Error(`${label}: ungültiges Frontmatter (${issues(parsed.error)})`);
  }
  const { title, colorStripe, wp_name, icon, order, map, osmAdminLevels } = parsed.data;
  if (!map.center) {
    throw new Error(`${label}: map.center fehlt`);
  }
  if (!isUtm(map.projection)) {
    throw new Error(
      `${label}: map.projection "${map.projection}" ist keine UTM-Projektion`,
    );
  }
  return {
    slug: entry.slug,
    title,
    wpName: wp_name,
    order: order ?? ORDER_FALLBACK,
    icon: icon ?? null,
    colorStripe,
    map: {
      center: [...map.center],
      zoom: map.zoom ?? 11, // wie getAllKommunen() in src/utils/kommune-utils.ts
      projection: map.projection,
    },
    osmAdminLevels,
  };
}

function parseKategorie(entry) {
  const parsed = kategorieSchema.safeParse(entry.data);
  if (!parsed.success) {
    throw new Error(
      `Kategorie "${entry.slug}": ungültiges Frontmatter (${issues(parsed.error)})`,
    );
  }
  const { title, icon, order, containerType } = parsed.data;
  return { slug: entry.slug, title, icon, order, containerType };
}

function assertUniqueSlugs(items, what) {
  const seen = new Set();
  for (const { slug } of items) {
    if (seen.has(slug)) {
      throw new Error(`${what} "${slug}": Slug kommt mehrfach vor`);
    }
    seen.add(slug);
  }
}

/**
 * Baut die Auswahl aus rohen Content-Einträgen (reine Funktion).
 * @param {{kommunen: Array<{slug: string, data: object}>, kategorien: Array<{slug: string, data: object}>}} input
 * @param {{getLevel?: (levels: number[]|undefined, containerType: string) => number}} [options]
 *   `getLevel` ersetzt die Regel aus @p2d2/core (nur für Tests).
 * @returns {object} Auswahl-Objekt (Version 1).
 */
export function buildSelection({ kommunen, kategorien }, { getLevel = getOsmAdminLevel } = {}) {
  const kats = kategorien
    .map(parseKategorie)
    .filter((k) => k.containerType)
    .sort(byOrderThenSlug)
    .slice(0, MAX_KATEGORIEN);
  const types = [...new Set(kats.map((k) => k.containerType))];
  const komm = kommunen.map(parseKommune);
  assertUniqueSlugs(komm, "Kommune");
  assertUniqueSlugs(kats, "Kategorie");

  return {
    version: SELECTION_VERSION,
    kommunen: komm.sort(byOrderThenSlug).map(({ osmAdminLevels, ...k }) => ({
      ...k,
      osmAdminLevel: Object.fromEntries(
        types.map((type) => {
          const level = getLevel(osmAdminLevels, type);
          if (!Number.isInteger(level)) {
            throw new Error(
              `Kommune "${k.slug}", Typ "${type}": kein OSM-Admin-Level ermittelt`,
            );
          }
          return [type, level];
        }),
      ),
    })),
    kategorien: kats.map(({ slug, title, icon, order, containerType }) => ({
      slug,
      title,
      icon,
      order,
      containerType,
    })),
  };
}

/** Feste Serialisierung: 2 Leerzeichen, abschließender Zeilenumbruch. */
export function serialize(selection) {
  return `${JSON.stringify(selection, null, 2)}\n`;
}

/** Liest alle .md/.mdx-Dateien eines Content-Verzeichnisses (Slug wie in Astro). */
export function readCollection(dir) {
  return readdirSync(dir)
    .filter((f) => [".md", ".mdx"].includes(extname(f)))
    .sort()
    .map((f) => {
      const { data } = matter(readFileSync(join(dir, f), "utf8"));
      return { slug: data.slug ?? basename(f, extname(f)), data };
    });
}

function main(argv) {
  const selection = buildSelection({
    kommunen: readCollection(KOMMUNEN_DIR),
    kategorien: readCollection(KATEGORIEN_DIR),
  });
  const text = serialize(selection);
  const rel = relative(ROOT, OUTPUT_FILE);

  if (argv.includes("--check")) {
    if (!existsSync(OUTPUT_FILE) || readFileSync(OUTPUT_FILE, "utf8") !== text) {
      console.error(
        `${rel} weicht von src/content ab. Neu erzeugen: npm run generate:masterportal-selection`,
      );
      return 1;
    }
    console.log(`${rel} ist aktuell.`);
    return 0;
  }
  writeFileSync(OUTPUT_FILE, text);
  console.log(
    `${rel} geschrieben: ${selection.kommunen.length} Kommunen, ${selection.kategorien.length} Kategorien.`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`Fehler: ${err.message}`);
    process.exitCode = 1;
  }
}
