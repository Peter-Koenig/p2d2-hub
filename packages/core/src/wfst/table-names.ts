// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// @p2d2/core — Mapping von feature_type auf konkrete DB-Tabellennamen.
//
// Dies ist der EINZIGE Ort, an dem feature_type auf konkrete Tabellennamen
// gemappt wird (bewusst astro-/postgres-frei, damit es von Astro und dem
// späteren Masterportal-Addon gleichermaßen genutzt werden kann).

// Ausnahmen für abweichende Pluralformen im Tabellennamen:
//   grabflur → p2d2_grabflure  (deutsches Plural-e)
const TABLE_SUFFIX_MAP: Record<string, string> = {
  grabflur: "grabflure",
};

function tableSuffix(featureType: string): string {
  return TABLE_SUFFIX_MAP[featureType] ?? featureType;
}

/**
 * Ermittelt den Quell-Tabellennamen für einen feature_type.
 * @example resolveSourceTable('grabflur') → 'p2d2_grabflure'
 */
export function resolveSourceTable(featureType: string): string {
  return `p2d2_${tableSuffix(featureType)}`;
}

/**
 * Ermittelt den Versionen-Tabellennamen für einen feature_type.
 * @example resolveVersionTable('grabflur') → 'p2d2_grabflure_versionen'
 */
export function resolveVersionTable(featureType: string): string {
  return `p2d2_${tableSuffix(featureType)}_versionen`;
}
