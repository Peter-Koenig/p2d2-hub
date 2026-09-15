// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// @p2d2/core — Kommunen-Domänenlogik (reine, astro-freie Teile).
//
// Die Datenbeschaffung (Astro `getCollection` bzw. Dateisystem-Fallback)
// verbleibt in der App (`src/utils/kommune-utils.ts`). Hier liegen nur:
//   - der Datentyp `KommuneData`
//   - `DEFAULT_KOMMUNE_SLUG`
//   - pure Prädikate/Selektoren (`hasValidOSMData`, `findKommuneBySlug`,
//     `getKommunenReadyForSync`)

/** Aufbereitete Kommune-Daten (wie von der App geliefert). */
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

/** Fallback-Kommune, wenn keine Präferenz gesetzt ist. */
export const DEFAULT_KOMMUNE_SLUG = "koeln";

/** Prüft, ob eine Kommune vollständige OSM-Sync-Daten besitzt. */
export function hasValidOSMData(kommune: KommuneData): boolean {
  return (
    !!kommune.wpName &&
    !!kommune.osmAdminLevels &&
    kommune.osmAdminLevels.length > 0 &&
    !!kommune.map?.center
  );
}

/** Liefert die Kommune zu einem Slug (oder null). */
export function findKommuneBySlug(
  kommunen: KommuneData[],
  slug: string,
): KommuneData | null {
  return kommunen.find((k) => k.slug === slug) || null;
}

/** Filtert alle Kommunen, die für die Polygon-Synchronisation bereit sind. */
export function getKommunenReadyForSync(kommunen: KommuneData[]): KommuneData[] {
  return kommunen.filter(hasValidOSMData);
}
