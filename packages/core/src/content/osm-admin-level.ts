// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// @p2d2/core — OSM-Admin-Level der Geo-Container einer Kommune.
//
// Eine Regel für Standalone, Generator und Masterportal-Add-on. Eingaben sind
// das Frontmatter-Feld `osmAdminLevels` der Kommune und `containerType` der
// Kategorie; die Regel selbst steht nur hier.

/** Admin-Level der Friedhofs-Container. */
export const CEMETERY_ADMIN_LEVEL = 8;

/** Admin-Level, wenn die Kommune keine Ebenen liefert oder der Typ unbekannt ist. */
export const FALLBACK_ADMIN_LEVEL = 8;

/**
 * OSM-Admin-Level für den WFS-Filter der Hauptkarte.
 *
 * - `cemetery`: {@link CEMETERY_ADMIN_LEVEL}
 * - `administrative`: die Ebene unterhalb der Kommunengrenze, also der zweite
 *   Eintrag von `osmAdminLevels`; bei genau einem Eintrag (z. B. Stadtstaat)
 *   dieser; bei leerem oder fehlendem Array {@link FALLBACK_ADMIN_LEVEL}
 * - jeder andere Typ: {@link FALLBACK_ADMIN_LEVEL}
 */
export function getOsmAdminLevel(
  osmAdminLevels: readonly number[] | undefined,
  containerType: string,
): number {
  if (containerType === "cemetery") {
    return CEMETERY_ADMIN_LEVEL;
  }
  if (containerType === "administrative" && osmAdminLevels) {
    if (osmAdminLevels.length > 1) {
      return osmAdminLevels[1];
    }
    if (osmAdminLevels.length === 1) {
      return osmAdminLevels[0];
    }
  }
  return FALLBACK_ADMIN_LEVEL;
}
