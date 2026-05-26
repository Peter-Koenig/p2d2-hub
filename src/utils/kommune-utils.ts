// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Kommune-Utilities: Daten aus Content-Collection lesen
import { readFileSync, readdirSync } from "fs";
import { join, extname } from "path";
import matter from "gray-matter";

// erkennt zur Laufzeit, ob Astro-Runtime verfügbar ist
async function loadCollection() {
  try {
    const { getCollection } = await import("astro:content");
    return getCollection("kommunen");
  } catch {
    // Fallback: Dateien direkt lesen (CLI/Test-Kontext)
    const dir = join(process.cwd(), "src/content/kommunen");
    return readdirSync(dir)
      .filter((f) => [".md", ".mdx"].includes(extname(f)))
      .map((f) => {
        const raw = readFileSync(join(dir, f), "utf-8");
        const { data } = matter(raw);
        return { slug: f.replace(/\.(mdx?)$/, ""), data };
      });
  }
}

// Central configuration for default kommune
export const DEFAULT_KOMMUNE_SLUG = "koeln";

// Interface for kommune data
export interface KommuneData {
  slug: string;
  title: string;
  osmAdminLevels?: number[];
  wpName: string;
  osm_refinement?: string;
  colorStripe: string;
  map: {
    center: [number, number];
    zoom: number;
    projection: string;
    extent?: [number, number, number, number];
    extra?: Record<string, any>;
  };
  order?: number;
  icon?: string;
}

export async function getAllKommunen(): Promise<KommuneData[]> {
  const col = await loadCollection();
  return col
    .map(
      (k) =>
        ({
          slug: k.slug,
          title: k.data.title,
          osmAdminLevels: k.data.osmAdminLevels,
          wpName: k.data.wp_name,
          osm_refinement: k.data.osm_refinement,
          colorStripe: k.data.colorStripe || "#FF6900",
          map: {
            center: k.data.map?.center || [0, 0],
            zoom: k.data.map?.zoom || 11,
            projection: k.data.map?.projection || "EPSG:3857",
            extent: k.data.map?.extent,
            extra: k.data.map?.extra,
          },
          order: k.data.order,
          icon: k.data.icon,
        }) as KommuneData,
    )
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

export async function getKommuneBySlug(
  slug: string,
): Promise<KommuneData | null> {
  const kommunen = await getAllKommunen();
  return kommunen.find((k) => k.slug === slug) || null;
}

// Utility function to check if a kommune has valid OSM data
export function hasValidOSMData(kommune: KommuneData): boolean {
  return (
    !!kommune.wpName &&
    !!kommune.osmAdminLevels &&
    kommune.osmAdminLevels.length > 0 &&
    !!kommune.map?.center
  );
}

// Get kommunen that are ready for sync
export async function getKommunenReadyForSync(): Promise<KommuneData[]> {
  const kommunen = await getAllKommunen();
  return kommunen.filter(hasValidOSMData);
}
