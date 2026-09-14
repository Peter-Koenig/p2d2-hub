// SPDX-FileCopyrightText: 2026-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
//
// @p2d2/core — Public API surface.
//
// Turn 4 (Content/Preferences) exportiert:
//   - Content-Schemata (kommuneSchema, kategorieSchema)
//   - Kommunen-/Kategorien-Domänenlogik (pure Teile)
//   - Preference-Parsing (metadata-parser)
//   - Karten-Grundkonfiguration (MAP_CONFIG)
//
// Folgeturns ergänzen WFS-T, Workflow/Session und das QS-Skelett.

export * from "./content/schemas";
export * from "./content/kommunen";
export * from "./content/kategorien";
export * from "./preferences/metadata-parser";
export * from "./map/map-config";
