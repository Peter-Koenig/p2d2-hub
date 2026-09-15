// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Re-Export der Workflow-Typen aus @p2d2/core.
export type {
  WorkflowSessionContext,
  WorkflowSessionRequest,
  SessionOpenResult,
  SessionCloseRequest,
  SessionCloseResponse,
  WorkflowSessionError,
  FeatureData,
} from "@p2d2/core";
export { SessionConflictError } from "@p2d2/core";
