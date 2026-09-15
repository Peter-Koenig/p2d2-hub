// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// @p2d2/core — Kategorien-Domänenlogik (reine, astro-freie Teile).

/** Aufbereitete Kategorie-Daten (wie von der App geliefert). */
export interface KategorieData {
  slug: string;
  title: string;
  icon: string;
  order: number;
  description: string;
  containerType?: string;
}

/**
 * Baut die Slug→Container-Typ-Abbildung aus einer Kategorien-Liste.
 * Kategorien ohne `containerType` werden übersprungen.
 */
export function buildKategorieContainerMapping(
  kategorien: KategorieData[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const kategorie of kategorien) {
    if (kategorie.containerType) {
      mapping[kategorie.slug] = kategorie.containerType;
    }
  }
  return mapping;
}
