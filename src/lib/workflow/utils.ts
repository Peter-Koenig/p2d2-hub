// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Re-Export der Workflow-Hilfsfunktionen aus @p2d2/core.
export {
  getDomainFields,
  getCachedDomainFields,
  getFeatureData,
  quoteIdent,
  resolveStageFromUrl,
  resolveSourceTable,
  resolveVersionTable,
} from "@p2d2/core";
export type { StageConfig, DbClient } from "@p2d2/core";
