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
// Bilder: Je Kommune und Kategorie bestimmt der Generator das Bild nach der
// Regel des Standalone (KommunenGrid.astro, Kategorien.astro:
// <slug>_<image_version>.jpg, Standard 001) und kopiert es aus public/images/
// nach portal/resources/img/p2d2/ (Teil des Portal-Images). Dateien in diesem
// Ordner, die keine Auswahl mehr nutzt, entfernt er.
//
// Aufruf (siehe package.json, baut vorher @p2d2/core):
//   npm run generate:masterportal-selection             Datei und Bilder schreiben
//   npm run generate:masterportal-selection -- --check  Abweichung -> Exit 1

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import matter from "gray-matter";
import {
  getOsmAdminLevel,
  kategorieSchema,
  kommuneSchema,
} from "@p2d2/core";
import { isUtm } from "../supplement/masterportal/addons/p2d2Crs/js/utm.js";
import { extentErrors } from "../supplement/masterportal/addons/p2d2Selector/js/selection.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Bildordner im Portal, relativ zur Portal-Seite (Feld image der Auswahl). */
export const IMAGE_URL_PREFIX = "resources/img/p2d2";

/** Arten von Einträgen; zugleich Unterordner der Bilder in Quelle und Ziel. */
const IMAGE_KINDS = ["kommunen", "kategorien"];

/**
 * Pfade des Generators unter einem Repo-Stamm (für Tests austauschbar).
 * @param {string} root Repo-Stamm.
 */
export function defaultPaths(root) {
  const portal = join(root, "supplement/masterportal/portal");
  return {
    root,
    kommunenDir: join(root, "src/content/kommunen"),
    kategorienDir: join(root, "src/content/kategorien"),
    imageSourceDirs: {
      kommunen: join(root, "public/images/kommunen"),
      kategorien: join(root, "public/images/kategorien"),
    },
    outputFile: join(portal, "resources/p2d2-selection.json"),
    imageTargetDir: join(portal, IMAGE_URL_PREFIX),
  };
}

const PATHS = defaultPaths(ROOT);
export const OUTPUT_FILE = PATHS.outputFile;

/**
 * Bilddatei nach der Regel des Standalone (KommunenGrid.astro, Kategorien.astro).
 * @param {string} slug Slug des Eintrags.
 * @param {string|undefined} imageVersion image_version aus der Collection.
 */
export function imageFileName(slug, imageVersion) {
  return `${slug}_${imageVersion ?? "001"}.jpg`;
}

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
  const { title, colorStripe, wp_name, icon, order, map, osmAdminLevels, image_version } = parsed.data;
  if (!map.center) {
    throw new Error(`${label}: map.center fehlt`);
  }
  if (map.extent !== undefined) {
    const errors = extentErrors(map.extent, map.center);
    if (errors.length > 0) {
      throw new Error(`${label}: map.extent ungültig (${errors.join("; ")})`);
    }
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
    imageFile: imageFileName(entry.slug, image_version),
    map: {
      center: [...map.center],
      zoom: map.zoom ?? 11, // wie getAllKommunen() in src/utils/kommune-utils.ts
      projection: map.projection,
      ...(map.extent ? { extent: [...map.extent] } : {}),
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
  const { title, icon, order, containerType, image_version } = parsed.data;
  return {
    slug: entry.slug,
    title,
    icon,
    order,
    containerType,
    imageFile: imageFileName(entry.slug, image_version),
  };
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
 * @param {object} [options]
 * @param {(levels: number[]|undefined, containerType: string) => number} [options.getLevel]
 *   Ersetzt die Regel aus @p2d2/core (nur für Tests).
 * @param {(kind: string, file: string) => boolean} [options.imageExists]
 *   Ob das Bild im Standalone-Ordner liegt (Standard: Dateisystem unter public/images).
 * @param {(message: string) => void} [options.warn] Warnung bei fehlendem Bild.
 * @returns {object} Auswahl-Objekt (Version 1).
 */
export function buildSelection(
  { kommunen, kategorien },
  {
    getLevel = getOsmAdminLevel,
    imageExists = (kind, file) => existsSync(join(PATHS.imageSourceDirs[kind], file)),
    warn = (message) => console.warn(`Warnung: ${message}`),
  } = {},
) {
  const image = (kind, entry) => {
    if (imageExists(kind, entry.imageFile)) {
      return `${IMAGE_URL_PREFIX}/${kind}/${entry.imageFile}`;
    }
    warn(`${kind} "${entry.slug}": Bild ${entry.imageFile} fehlt, image ist null`);
    return null;
  };
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
    kommunen: komm.sort(byOrderThenSlug).map(({ osmAdminLevels, imageFile, ...k }) => ({
      ...k,
      image: image("kommunen", { slug: k.slug, imageFile }),
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
    kategorien: kats.map(({ slug, title, icon, order, containerType, imageFile }) => ({
      slug,
      title,
      icon,
      order,
      containerType,
      image: image("kategorien", { slug, imageFile }),
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

/** SHA-256 einer Datei (hex). */
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** Dateien unter dir, relativ zu dir, mit "/" getrennt; fehlt dir: leer. */
function listFiles(dir, prefix = "") {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      return statSync(full).isDirectory() ? listFiles(full, rel) : [rel];
    });
}

/**
 * Auswahl und Bildplan zu den Pfaden.
 * @param {ReturnType<typeof defaultPaths>} paths Pfade.
 * @param {{warn?: (message: string) => void}} [io] Ausgabe.
 */
function plan(paths, { warn } = {}) {
  const selection = buildSelection(
    { kommunen: readCollection(paths.kommunenDir), kategorien: readCollection(paths.kategorienDir) },
    {
      imageExists: (kind, file) => existsSync(join(paths.imageSourceDirs[kind], file)),
      ...(warn ? { warn } : {}),
    },
  );
  const images = IMAGE_KINDS.flatMap((kind) =>
    selection[kind]
      .filter((e) => e.image)
      .map((e) => {
        const file = basename(e.image);
        return {
          rel: `${kind}/${file}`,
          source: join(paths.imageSourceDirs[kind], file),
          target: join(paths.imageTargetDir, kind, file),
        };
      }),
  );
  return { selection, text: serialize(selection), images };
}

/**
 * Prüft Auswahl-Datei und Bilder gegen src/content und public/images (--check).
 * @param {ReturnType<typeof defaultPaths>} paths Pfade.
 * @returns {{ok: boolean, problems: string[]}} Ergebnis.
 */
export function checkGenerated(paths) {
  const { text, images } = plan(paths, { warn: () => {} });
  const problems = [];
  const rel = relative(paths.root, paths.outputFile);
  if (!existsSync(paths.outputFile) || readFileSync(paths.outputFile, "utf8") !== text) {
    problems.push(`${rel} weicht von src/content ab`);
  }
  for (const { rel: file, source, target } of images) {
    if (!existsSync(target)) {
      problems.push(`Bild ${file} fehlt im Portal`);
    } else if (sha256(target) !== sha256(source)) {
      problems.push(`Bild ${file} weicht von der Quelle ab`);
    }
  }
  const wanted = new Set(images.map((i) => i.rel));
  for (const file of listFiles(paths.imageTargetDir)) {
    if (!wanted.has(file)) {
      problems.push(`Bild ${file} ist verwaist (keine Auswahl nutzt es)`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Schreibt Auswahl-Datei und Bilder; entfernt verwaiste Dateien im Bildordner.
 * @param {ReturnType<typeof defaultPaths>} paths Pfade.
 * @param {{warn?: (message: string) => void, log?: (message: string) => void}} [io] Ausgabe.
 * @returns {{selection: object, copied: string[], removed: string[]}} Ergebnis.
 */
export function writeGenerated(paths, { warn, log = console.log } = {}) {
  const { selection, text, images } = plan(paths, { warn });
  writeFileSync(paths.outputFile, text);
  const copied = [];
  for (const { rel: file, source, target } of images) {
    if (!existsSync(target) || sha256(target) !== sha256(source)) {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
      copied.push(file);
    }
  }
  const wanted = new Set(images.map((i) => i.rel));
  const removed = listFiles(paths.imageTargetDir).filter((file) => !wanted.has(file));
  for (const file of removed) {
    rmSync(join(paths.imageTargetDir, file));
  }
  const bytes = images.reduce((sum, i) => sum + statSync(i.target).size, 0);
  log(
    `${relative(paths.root, paths.outputFile)} geschrieben: ${selection.kommunen.length} Kommunen, ` +
      `${selection.kategorien.length} Kategorien; Bilder: ${images.length} (${bytes} Bytes), ` +
      `kopiert ${copied.length}, entfernt ${removed.length}.`,
  );
  return { selection, copied, removed };
}

function main(argv) {
  if (argv.includes("--check")) {
    const { ok, problems } = checkGenerated(PATHS);
    if (!ok) {
      for (const problem of problems) {
        console.error(problem);
      }
      console.error("Neu erzeugen: npm run generate:masterportal-selection");
      return 1;
    }
    console.log(`${relative(ROOT, PATHS.outputFile)} und ${relative(ROOT, PATHS.imageTargetDir)}/ sind aktuell.`);
    return 0;
  }
  writeGenerated(PATHS);
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
