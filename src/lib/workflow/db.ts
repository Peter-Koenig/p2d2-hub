// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Generische Datenbank-Workflow-Funktionen für den Session-Workflow.
//
// PUBLIC API (managen eigene Transaktionen):
//   openSession(params)  – Schritte 1–3: Version 0, Session, Feature-Status
//   closeSession(params) – Schritte 5–6: Snapshot, Session schliessen, QS1
//
// INTERNE HELPER (brauchen ein tx-Objekt aus einer bereits offenen Transaktion):
//   ensureVersion0, insertSessionRecord, setFeatureStatusInProgress,
//   finalizeSnapshot, updateSessionCompleted, updateFeatureStatusQs1
//
// Alle Funktionen arbeiten themenunabhängig: Tabellen- und Spaltennamen
// werden aus dem Parameter `featureType` abgeleitet (via utils.ts).
// Schritt 4 (WFS-T) liegt ausserhalb – der Browser sendet ihn direkt an
// den GeoServer, nachdem POST /api/workflow/session die Session geöffnet hat.

import type postgres from "postgres";
import type { WorkflowSessionRequest } from "../../types/workflow";
import { SessionConflictError } from "../../types/workflow";
import type {
  SessionOpenResult,
  SessionCloseResponse,
} from "../../types/workflow";
import {
  resolveSourceTable,
  resolveVersionTable,
  getCachedDomainFields,
  quoteIdent,
} from "./utils";
import type { DbClient } from "./utils";

// =============================================================================
// ÖFFENTLICHE PARAMETER-INTERFACES
// =============================================================================

export interface OpenSessionParams {
  /** Pool-Connection (kein tx – die Funktion startet selbst eine Transaktion) */
  sql: postgres.Sql<{}>;
  /** DB-Schema (z. B. "p2d2_de1") */
  schema: string;
  /** Vollständiger Request-Body aus POST /api/workflow/session */
  body: WorkflowSessionRequest;
  /** E-Mail des authentifizierten Benutzers */
  userEmail: string;
}

export interface CloseSessionParams {
  /** Pool-Connection */
  sql: postgres.Sql<{}>;
  /** DB-Schema */
  schema: string;
  /** ID der zu schliessenden Session */
  sessionId: number;
  /** UUID der via WFS-T angelegten Version 1 */
  versionId: string;
  /** Themen-Schlüssel (z. B. "grabflur") – wird aus dem Session-Record gelesen */
  featureType: string;
  /** UUID des Fachobjekts (p2d2_uuid) – wird aus der Versionentabelle gelesen */
  featureUuid: string;
  /** E-Mail des schliessenden Benutzers */
  userEmail: string;
}

// =============================================================================
// PUBLIC API  –  jede Funktion managt ihre eigene DB-Transaktion
// =============================================================================

/**
 * Öffnet eine neue Workflow-Session (Schritte 1–3 in einer Transaktion).
 *
 * 1. Version 0 idempotent anlegen
 * 2. Session-Record in wf_sessions (state = 'active')
 * 3. Feature-Status auf 'in_bearbeitung' setzen (UPSERT)
 *
 * @returns SessionOpenResult mit session_id und workflow_status
 * @throws { code: 'SESSION_CONFLICT' }  bei 23505 (aktive Session existiert)
 * @throws { code: 'INTERNAL_ERROR', cause }  bei sonstigen DB-Fehlern
 */
export async function openSession(
  params: OpenSessionParams,
): Promise<SessionOpenResult> {
  try {
    return await params.sql.begin(async (tx) => {
      // Schritt 1: Version 0 (idempotent)
      await ensureVersion0(
        tx,
        params.schema,
        params.body.feature_type,
        params.body.feature_uuid,
      );

      // Schritt 2: Session öffnen
      const sessionId: number = await insertSessionRecord(
        tx,
        params.schema,
        params.body,
        params.userEmail,
      );

      // Schritt 3: Feature-Status → 'in_bearbeitung'
      await setFeatureStatusInProgress(
        tx,
        params.schema,
        params.body.feature_type,
        params.body.feature_uuid,
        sessionId,
      );

      return {
        session_id: sessionId,
        workflow_status: "in_bearbeitung" as const,
      };
    });
  } catch (err: unknown) {
    if (err instanceof SessionConflictError) {
      throw { code: "SESSION_CONFLICT" as const, cause: err };
    }
    throw { code: "INTERNAL_ERROR" as const, cause: err };
  }
}

/**
 * Schliesst eine aktive Workflow-Session (Schritte 5–6 in einer Transaktion).
 *
 * 5. Snapshot-Eintrag in wf_snapshots (is_final=true, kind='manual')
 * 6. Session auf 'completed' setzen + Feature-Status auf 'qs1_ausstehend'
 *
 * @returns SessionCloseResponse mit session_id, version_id, snapshot_id, workflow_status
 * @throws { code: 'INTERNAL_ERROR', cause }  bei DB-Fehlern
 */
export async function closeSession(
  params: CloseSessionParams,
): Promise<SessionCloseResponse> {
  try {
    return await params.sql.begin(async (tx) => {
      // Schritt 5: Snapshot finalisieren
      const snapshotId: number = await insertSnapshotRecord(
        tx,
        params.schema,
        params.featureType,
        params.sessionId,
        params.featureUuid,
        params.versionId,
        params.userEmail,
      );

      // Schritt 6: Session + Feature-Status abschliessen
      await updateSessionCompleted(
        tx,
        params.schema,
        params.sessionId,
        params.featureType,
        params.featureUuid,
        params.userEmail,
      );

      return {
        session_id: params.sessionId,
        version_id: params.versionId,
        snapshot_id: snapshotId,
        workflow_status: "qs1_ausstehend" as const,
      };
    });
  } catch (err: unknown) {
    throw { code: "INTERNAL_ERROR" as const, cause: err };
  }
}

// =============================================================================
// INTERNE HELPER  –  benötigen ein tx-Objekt (laufende Transaktion)
// =============================================================================

/**
 * Legt Version 0 in der Versionentabelle an (idempotent).
 *
 * Kopiert sämtliche Domain-Attribute aus der Quelltabelle in die
 * Versionentabelle und setzt die System-Spalten auf die Initialwerte.
 * Falls Version 0 bereits existiert, wird sie nicht erneut angelegt.
 *
 * @returns version_id der Version 0 (UUID)
 * @throws Error wenn das Feature in der Quelltabelle nicht existiert
 */
export async function ensureVersion0(
  tx: DbClient,
  schema: string,
  featureType: string,
  featureUuid: string,
): Promise<string> {
  const fkCol = `${featureType}_id`;
  const versionTable = resolveVersionTable(featureType);

  // Prüfen: Existiert bereits Version 0? (Idempotenz)
  const [existing] = await tx`
    SELECT version_id
    FROM ${tx(schema)}.${tx(versionTable)}
    WHERE ${tx(fkCol)} = ${featureUuid}
      AND version_nr  = 0
    LIMIT 1
  `;
  if (existing) return existing.version_id;

  // Domain-Spalten dynamisch ermitteln
  const domainFields = await getCachedDomainFields(tx, schema, featureType);
  const sourceTable = resolveSourceTable(featureType);

  // System-Spalten + Domain-Spalten im INSERT
  const insertCols = [
    quoteIdent(fkCol),
    quoteIdent("version_nr"),
    quoteIdent("session_id"),
    quoteIdent("is_session_boundary"),
    quoteIdent("created_by"),
    quoteIdent("edit_comment"),
    quoteIdent("geom"),
    ...domainFields.map(quoteIdent),
  ];

  const selectCols = [
    "src.p2d2_uuid",
    "0",
    "NULL",
    "false",
    "'system:import'",
    "'Ausgangsversion aus Import'",
    "src.geom",
    ...domainFields.map((c) => `src.${quoteIdent(c)}`),
  ];

  const insertSql = `
    INSERT INTO ${quoteIdent(schema)}.${quoteIdent(versionTable)} (
      ${insertCols.join(",\n      ")}
    )
    SELECT ${selectCols.join(",\n       ")}
    FROM ${quoteIdent(schema)}.${quoteIdent(sourceTable)} AS src
    WHERE src.p2d2_uuid = $1
    RETURNING version_id
  `;

  const [result] = await tx.unsafe(insertSql, [featureUuid]);
  if (!result) {
    throw new Error(
      `Feature ${featureUuid} in Tabelle ${sourceTable} nicht gefunden`,
    );
  }

  return result.version_id;
}

/**
 * Erzeugt einen neuen Session-Eintrag in wf_sessions (state = 'active').
 *
 * @returns session_id der neu angelegten Session
 * @throws SessionConflictError bei unique_violation (23505)
 */
export async function insertSessionRecord(
  tx: DbClient,
  schema: string,
  body: WorkflowSessionRequest,
  userEmail: string,
): Promise<number> {
  try {
    const [row] = await tx`
      INSERT INTO ${tx(schema)}.${tx("wf_sessions")} (
        feature_type,
        feature_set_id,
        state,
        started_by,
        wpname,
        municipality,
        context_key,
        context_label,
        context_value
      ) VALUES (
        ${body.feature_type},
        ${body.feature_set_id},
        'active',
        ${userEmail},
        ${body.wpname},
        ${body.municipality},
        ${body.context.key},
        ${body.context.label},
        ${body.context.value}
      )
      RETURNING id
    `;
    return row.id as number;
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as any).code === "23505"
    ) {
      throw new SessionConflictError(
        `Session für feature_set_id '${body.feature_set_id}' bereits offen`,
      );
    }
    throw err;
  }
}

/**
 * Setzt den Feature-Status auf 'in_bearbeitung' (UPSERT).
 */
export async function setFeatureStatusInProgress(
  tx: DbClient,
  schema: string,
  featureType: string,
  featureUuid: string,
  sessionId: number,
): Promise<void> {
  await tx`
    INSERT INTO ${tx(schema)}.${tx("wf_feature_status")} (
      feature_type,
      feature_id,
      state,
      last_session_id
    ) VALUES (
      ${featureType},
      ${featureUuid},
      'in_bearbeitung',
      ${sessionId}
    )
    ON CONFLICT (feature_type, feature_id)
    DO UPDATE SET
      state           = 'in_bearbeitung',
      last_session_id = ${sessionId},
      updated_at      = now()
  `;
}

/**
 * Erzeugt einen Snapshot-Eintrag in wf_snapshots (is_final=true, kind='manual').
 *
 * @returns snapshot_id des neu angelegten Snapshots
 */
export async function insertSnapshotRecord(
  tx: DbClient,
  schema: string,
  featureType: string,
  sessionId: number,
  featureUuid: string,
  versionId: string,
  userEmail: string,
): Promise<number> {
  // snapshot_no ermitteln
  const [maxRow] = await tx`
    SELECT COALESCE(MAX(snapshot_no), 0) + 1 AS next_no
    FROM ${tx(schema)}.${tx("wf_snapshots")}
    WHERE session_id = ${sessionId}
  `;
  const snapshotNo: number = maxRow?.next_no ?? 1;

  const versionTable = resolveVersionTable(featureType);

  const [row] = await tx`
    INSERT INTO ${tx(schema)}.${tx("wf_snapshots")} (
      session_id,
      feature_type,
      version_table,
      version_id,
      snapshot_no,
      is_final,
      kind,
      created_by,
      feature_id
    ) VALUES (
      ${sessionId},
      ${featureType},
      ${versionTable},
      ${versionId},
      ${snapshotNo},
      true,
      'manual',
      ${userEmail},
      ${featureUuid}
    )
    RETURNING id
  `;

  return row.id as number;
}

/**
 * Setzt wf_sessions auf 'completed' und wf_feature_status auf 'qs1_ausstehend'.
 */
export async function updateSessionCompleted(
  tx: DbClient,
  schema: string,
  sessionId: number,
  featureType: string,
  featureUuid: string,
  userEmail: string,
): Promise<void> {
  await tx`
    UPDATE ${tx(schema)}.${tx("wf_sessions")}
    SET state    = 'completed',
        ended_by = ${userEmail},
        ended_at = now()
    WHERE id = ${sessionId}
  `;

  await tx`
    UPDATE ${tx(schema)}.${tx("wf_feature_status")}
    SET state           = 'qs1_ausstehend',
        last_session_id = ${sessionId},
        updated_at      = now()
    WHERE feature_type = ${featureType}
      AND feature_id   = ${featureUuid}
  `;
}
