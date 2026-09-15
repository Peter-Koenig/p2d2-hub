// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Re-Export der Workflow-DB-Funktionen aus @p2d2/core.
export {
  openSession,
  closeSession,
  commitContainerVersion,
  ensureVersion0,
  ensureVersion0ForContainer,
  insertSessionRecord,
  setFeatureStatusInProgress,
  setContainerFeatureStatusInProgress,
  insertSnapshotRecord,
  updateSessionCompleted,
} from "@p2d2/core";
export type {
  OpenSessionParams,
  CloseSessionParams,
  CommitContainerParams,
  CommitContainerResult,
} from "@p2d2/core";
