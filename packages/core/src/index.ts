// SPDX-FileCopyrightText: 2026-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
//
// @p2d2/core — Public API surface.
//
// Turn 4 (Content/Preferences):
//   - Content-Schemata (kommuneSchema, kategorieSchema)
//   - Kommunen-/Kategorien-Domänenlogik (pure Teile)
//   - Preference-Parsing (metadata-parser)
//   - Karten-Grundkonfiguration (MAP_CONFIG)
//
// Turn 6 (WFS-T):
//   - Tabellen-Namens-Mapping, WFS-T-Insert/Delete (XML + HTTP)
//   - Reine WFS-URL-/Request-Bau-Logik

export * from "./content/schemas";
export * from "./content/kommunen";
export * from "./content/kategorien";
export * from "./preferences/metadata-parser";
export * from "./map/map-config";
export * from "./wfst/table-names";
export * from "./wfst/wfst";
export * from "./wfst/wfs-url";
export * from "./db/types";
export * from "./workflow/types";
export * from "./workflow/utils";
export * from "./workflow/db";
export * from "./qs/types";
