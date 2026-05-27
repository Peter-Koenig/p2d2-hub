// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Generische Datenbank-Workflow-Funktionen für den Session-Workflow.
//
// Alle Funktionen arbeiten themenunabhängig: Tabellen- und Spaltennamen
// werden aus dem Parameter `featureType` abgeleitet (via utils.ts).
// Die aufrufende Route (POST /api/workflow/session) übergibt die Werte
// aus dem Request-Body – die API hat kein Wissen über deren fachliche
// Bedeutung.
//
// Wichtige Einschränkung:
//   Schritte 1–3 und 5–6 laufen in einer DB-Transaktion (sql.begin()).
//   Schritt 4 (WFS-T) ist ein HTTP-Aufruf und liegt konzeptionell
//   außerhalb der DB-Transaktion – GeoServer-Seiteneffekte sind nicht
//   rollbackbar.

import type { WorkflowSessionRequest } from "../../types/workflow";
import { SessionConflictError } from "../../types/workflow";
import {
  resolveSourceTable,
  resolveVersionTable,
  getCachedDomainFields,
  quoteIdent,
} from "./utils";
import type { DbClient } from "./utils";

// =============================================================================
// Schritt 1: Version 0 idempotent anlegen
// =============================================================================

/**
 * Legt Version 0 in der Versionentabelle an (idempotent).
 *
 * Kopiert sämtliche Domain-Attribute aus der Quelltabelle in die
 * Versionentabelle und setzt die System-Spalten auf die Initialwerte:
 *   - session_id = NULL, version_nr = 0, is_session_boundary = false
 *   - created_by = 'system:import'
 *   - edit_comment = 'Ausgangsversion aus Import'
 *
 * Falls Version 0 bereits existiert, wird sie nicht erneut angelegt
 * und die vorhandene version_id zurückgegeben.
 *
 * @param tx          – Aktive Transaktion
 * @param schema      – DB-Schema (z. B. "p2d2_de1")
 * @param featureType – Themen-Schlüssel (z. B. "grabflur")
 * @param featureUuid – p2d2_uuid des Quell-Objekts
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

  // -------------------------------------------------------------------
  // Prüfen: Existiert bereits Version 0? (Idempotenz)
  // -------------------------------------------------------------------
  const [existing] = await tx`
    SELECT version_id
    FROM ${tx(schema, versionTable)}
    WHERE ${tx(fkCol)} = ${featureUuid}
      AND version_nr  = 0
    LIMIT 1
  `;
  if (existing) return existing.version_id;

  // -------------------------------------------------------------------
  // Domain-Spalten dynamisch ermitteln (information_schema)
  // -------------------------------------------------------------------
  const domainFields = await getCachedDomainFields(tx, schema, featureType);
  const sourceTable = resolveSourceTable(featureType);

  // -------------------------------------------------------------------
  // INSERT dynamisch bauen
  //
  // Die Spaltennamen stammen aus information_schema (trusted source),
  // daher ist sql.unsafe() für den Struktur-Teil akzeptabel.
  // Der featureUuid-Parameter wird via $1 gebunden.
  //
  // System-Spalten werden mit festen Werten belegt:
  //   ${fkCol}          ← src.p2d2_uuid
  //   version_nr        ← 0
  //   session_id        ← NULL
  //   is_session_boundary ← false
  //   created_by        ← 'system:import'
  //   edit_comment      ← 'Ausgangsversion aus Import'
  //   geom              ← src.geom
  //
  // Domain-Spalten werden 1:1 aus der Quelltabelle übernommen.
  // -------------------------------------------------------------------
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

  // language=PostgreSQL
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

// =============================================================================
// Schritt 2: Session öffnen
// =============================================================================

/**
 * Öffnet eine neue Session in der Tabelle wf_sessions.
 *
 * @param tx        – Aktive Transaktion
 * @param schema    – DB-Schema
 * @param body      – Der Request-Body (WorkflowSessionRequest)
 * @param userEmail – E-Mail des angemeldeten Benutzers (x-user-email Header)
 * @returns session_id (Integer) der neu angelegten Session
 * @throws SessionConflictError wenn für feature_set_id bereits eine aktive
 *         Session existiert (Unique-Constraint 23505)
 */
export async function openSession(
  tx: DbClient,
  schema: string,
  body: WorkflowSessionRequest,
  userEmail: string,
): Promise<number> {
  try {
    const [row] = await tx`
      INSERT INTO ${tx(schema, "wf_sessions")} (
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
    // PostgreSQL unique_violation
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

// =============================================================================
// Schritt 3: Feature-Status setzen → 'in_bearbeitung'
// =============================================================================

/**
 * Setzt den Status eines Features in wf_feature_status auf 'in_bearbeitung'.
 *
 * Nutzt UPSERT (INSERT … ON CONFLICT DO UPDATE), damit der Status
 * sowohl für neue als auch bereits existierende Einträge gesetzt wird.
 *
 * @param tx          – Aktive Transaktion
 * @param schema      – DB-Schema
 * @param featureType – Themen-Schlüssel
 * @param featureUuid – UUID des Fachobjekts
 * @param sessionId   – ID der aktuellen Session
 */
export async function setFeatureStatus(
  tx: DbClient,
  schema: string,
  featureType: string,
  featureUuid: string,
  sessionId: number,
): Promise<void> {
  await tx`
    INSERT INTO ${tx(schema, "wf_feature_status")} (
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

// =============================================================================
// Schritt 5: Snapshot finalisieren
// =============================================================================

/**
 * Erzeugt einen Eintrag in wf_snapshots mit is_final=true.
 *
 * snapshot_no wird automatisch als MAX(snapshot_no) + 1 für die
 * aktuelle Session bestimmt. Version 1 wird durch den WFS-T-Insert
 * erzeugt – diese Funktion persistiert lediglich den Verweis darauf.
 *
 * @param tx          – Aktive Transaktion
 * @param schema      – DB-Schema
 * @param featureType – Themen-Schlüssel
 * @param sessionId   – ID der aktuellen Session
 * @param featureUuid – UUID des Fachobjekts
 * @param versionId   – version_id aus der WFS-T-Response
 * @param userEmail   – E-Mail des Bearbeiters
 * @returns snapshot_id (Integer) des neu angelegten Snapshots
 */
export async function finalizeSnapshot(
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
    FROM ${tx(schema, "wf_snapshots")}
    WHERE session_id = ${sessionId}
  `;
  const snapshotNo: number = maxRow?.next_no ?? 1;

  // Versionstabelle als String für wf_snapshots.version_table
  const versionTable = resolveVersionTable(featureType);

  const [row] = await tx`
    INSERT INTO ${tx(schema, "wf_snapshots")} (
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

// =============================================================================
// Schritt 6: Session schliessen + Feature-Status → 'qs1_ausstehend'
// =============================================================================

/**
 * Schließt die Session und setzt den Feature-Status auf 'qs1_ausstehend'.
 *
 * Führt zwei UPDATE-Statements in der Reihenfolge aus:
 *   1. wf_sessions.state = 'completed'
 *   2. wf_feature_status.state = 'qs1_ausstehend'
 *
 * @param tx          – Aktive Transaktion
 * @param schema      – DB-Schema
 * @param featureType – Themen-Schlüssel
 * @param sessionId   – ID der zu schließenden Session
 * @param featureUuid – UUID des Fachobjekts
 * @param userEmail   – E-Mail des Bearbeiters (wird in ended_by gespeichert)
 */
export async function closeSession(
  tx: DbClient,
  schema: string,
  featureType: string,
  sessionId: number,
  featureUuid: string,
  userEmail: string,
): Promise<void> {
  // Session schließen
  await tx`
    UPDATE ${tx(schema, "wf_sessions")}
    SET state    = 'completed',
        ended_by = ${userEmail},
        ended_at = now()
    WHERE id = ${sessionId}
  `;

  // Feature-Status auf QS1 setzen
  await tx`
    UPDATE ${tx(schema, "wf_feature_status")}
    SET state           = 'qs1_ausstehend',
        last_session_id = ${sessionId},
        updated_at      = now()
    WHERE feature_type = ${featureType}
      AND feature_id   = ${featureUuid}
  `;
}
