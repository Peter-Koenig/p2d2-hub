// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// @p2d2/core — Generische Typen für den Session-Workflow.
//        Keine themenspezifischen Namen – feature_type kommt aus dem Body.

/**
 * Themenabhängiger Kontext der Session.
 * Wird unverändert in wf_sessions.context_{key,label,value} gespeichert.
 */
export interface WorkflowSessionContext {
  key: string;
  label: string;
  value: string;
}

export interface WorkflowSessionRequest {
  feature_type: string;
  feature_uuid?: string;
  feature_set_id: string;
  context: WorkflowSessionContext;
  wpname: string;
  municipality: string;
  edit_comment: string;
}

export interface SessionOpenResult {
  session_id: number;
  workflow_status: "in_bearbeitung";
  version_nr: number;
}

export interface SessionCloseRequest {
  version_id?: string | null;
  edit_comment?: string;
}

export interface SessionCloseResponse {
  session_id: number;
  version_id: string;
  snapshot_id: number;
  workflow_status: "qs1_ausstehend";
}

export interface WorkflowSessionError {
  error: string;
  message: string;
}

export class SessionConflictError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SessionConflictError";
  }
}

/** Re-Export des Feature-Datentyps (liegt im WFS-T-Modul). */
export type { FeatureData } from "../wfst/wfst";
