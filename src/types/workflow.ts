// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Generische TypeScript-Typen für den Session-Workflow
//        Keine themenspezifischen Namen – feature_type kommt aus dem Body.

/**
 * Themenabhängiger Kontext der Session.
 * Wird unverändert in wf_sessions.context_{key,label,value} gespeichert.
 * Die API hat kein Wissen über die Bedeutung der Felder.
 */
export interface WorkflowSessionContext {
  /** Schlüssel (z. B. "fh_nr" für Grabfluren) */
  key: string;
  /** Menschenlesbare Bezeichnung (z. B. "Friedhof Deutz") */
  label: string;
  /** Wert (z. B. "33") */
  value: string;
}

/**
 * Eingehende Anfrage an POST /api/workflow/session.
 *
 * @example
 * {
 *   "feature_type":   "grabflur",
 *   "feature_uuid":   "6d335980-e7a0-41ff-b092-344b9fabd3d1",
 *   "feature_set_id": "fh_33",
 *   "context": {
 *     "key":   "fh_nr",
 *     "label": "Friedhof Deutz",
 *     "value": "33"
 *   },
 *   "wpname":       "de-Koeln",
 *   "municipality": "koeln",
 *   "edit_comment": "Geometrie geprüft, keine Änderungen notwendig"
 * }
 */
export interface WorkflowSessionRequest {
  /** Themen-Schlüssel (z. B. "grabflur", "baum", "grab") */
  feature_type: string;
  /** UUID des Fachobjekts (p2d2_uuid in der Quelltabelle). Optional seit Container-Versions-Modell (wird bei Friedhofs-Session nicht gesendet). */
  feature_uuid?: string;
  /** ID des bearbeiteten Clusters (z. B. "fh_33") */
  feature_set_id: string;
  /** Themenabhängiger Session-Kontext */
  context: WorkflowSessionContext;
  /** Workplace-Name (z. B. "de-Koeln") */
  wpname: string;
  /** Kommune-Kürzel (z. B. "koeln") */
  municipality: string;
  /** Bearbeitungskommentar (Freitext) */
  edit_comment: string;
}

/**
 * Erfolgreiche Antwort von POST /api/workflow/session (Session öffnen).
 * Nach Schritt 3 ist die Session aktiv, aber noch nicht abgeschlossen.
 */
export interface SessionOpenResult {
  /** ID aus wf_sessions */
  session_id: number;
  /** Workflow-Status nach dem Öffnen */
  workflow_status: "in_bearbeitung";
  /** Reservierte Versionsnummer für den bevorstehenden Commit */
  version_nr: number;
}

// ---------------------------------------------------------------------------
// PATCH /api/workflow/session/:id – Session schließen
// ---------------------------------------------------------------------------

/**
 * Request-Body für PATCH /api/workflow/session/:id (Session schließen).
 *
 * @example
 * {
 *   "version_id": "682eb22f-06f6-4c42-bb05-bb0cf8f103af",
 *   "edit_comment": "Geometrie korrigiert"
 * }
 */
export interface SessionCloseRequest {
  /**
   * UUID der durch WFS-T angelegten Version (p2d2_*_versionen.version_id).
   * Kann null oder undefined sein – dann wird die Session auf 'aborted'
   * gesetzt (z. B. bei Benutzerabbruch ohne Änderungen).
   */
  version_id?: string | null;
  /** Optionaler abschließender Bearbeitungskommentar */
  edit_comment?: string;
}

/**
 * Erfolgreiche Antwort von PATCH /api/workflow/session/:id (Session schließen).
 * Nach Schritt 6 ist die Session completed und wartet auf QS1.
 */
export interface SessionCloseResponse {
  /** ID aus wf_sessions */
  session_id: number;
  /** UUID der abgeschlossenen Version */
  version_id: string;
  /** ID aus wf_snapshots */
  snapshot_id: number;
  /** Workflow-Status nach dem Schließen */
  workflow_status: "qs1_ausstehend";
}

// ---------------------------------------------------------------------------
// Fehlerantworten (beide Routen)
// ---------------------------------------------------------------------------

/**
 * Fehlerantwort von POST /api/workflow/session oder PATCH /api/workflow/session/:id.
 */
export interface WorkflowSessionError {
  /** Maschinenlesbarer Fehlercode (z. B. "SESSION_CONFLICT", "SESSION_NOT_ACTIVE") */
  error: string;
  /** Menschenlesbare Fehlerbeschreibung */
  message: string;
}

/**
 * Wird geworfen, wenn für feature_set_id bereits eine aktive Session existiert.
 * Der HTTP-Handler setzt dies in einen 409 Conflict um.
 */
export class SessionConflictError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SessionConflictError";
  }
}

// ---------------------------------------------------------------------------
// Interne Hilfstypen
// ---------------------------------------------------------------------------

/**
 * Struktur der Daten, die für den WFS-T-Export aus der DB gelesen werden.
 * Enthält die GML-Geometrie + alle Domain-Attribute als Key-Value-Map.
 */
export interface FeatureData {
  /** GML 3.2-Geometrie (EPSG:4326) */
  geom_gml: string;
  /** Alle Domain-Attribute (Spaltenname → Wert) */
  attributes: Record<string, unknown>;
}
