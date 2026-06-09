// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Generische Datenbank-Workflow-Funktionen für den Session-Workflow.
//
// PUBLIC API (managen eigene Transaktionen):
//   openSession(params)  – Schritte 1–3: Version 0, Session, Feature-Status
//   closeSession(params) – Schritte 5–6: Snapshot, Session schliessen, QS1
//   commitContainerVersion(params) – Container-Version finalisieren
//
// INTERNE HELPER (brauchen ein tx-Objekt aus einer bereits offenen Transaktion):
//   ensureVersion0, ensureVersion0ForContainer,
//   insertSessionRecord, setFeatureStatusInProgress,
//   setContainerFeatureStatusInProgress,
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
// Hilfsfunktion: BigInt/Number sicher konvertieren
// =============================================================================
// PostgreSQL BIGSERIAL-Spalten liefern JavaScript-BigInt-Werte, die
// JSON.stringify als String serialisiert. Die API-Spezifikation fordert
// aber number für id-Felder. toSafeId() konvertiert explizit und prüft
// auf Überschreitung von Number.MAX_SAFE_INTEGER (ca. 9 Billiarden).
//
// Sollten jemals IDs grösser als 2^53-1 vorkommen, muss das Format auf
// string umgestellt werden (dann toSafeId entfernen).
// ---------------------------------------------------------------------------

function toSafeId(value: unknown): number {
  const num = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isSafeInteger(num)) {
    throw new Error(
      `ID ${String(value)} überschreitet Number.MAX_SAFE_INTEGER – ` +
        "Umstellung auf string-Format erforderlich",
    );
  }
  return num;
}

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
// CONTAINER-VERSION-PARAMETER
// =============================================================================

export interface CommitContainerParams {
  /** Pool-Connection (kein tx – die Funktion startet selbst eine Transaktion) */
  sql: postgres.Sql<{}>;
  /** DB-Schema (z. B. "p2d2_de1") */
  schema: string;
  /** ID der zu schliessenden Session */
  sessionId: number;
  /** Themen-Schlüssel (z. B. "grabflur") */
  featureType: string;
  /** ID des Containers (z. B. "fh_33") */
  featureSetId: string;
  /** UUIDs der per WFS-T inserierten Features */
  modifiedUuids: string[];
  /** version_ids aus den WFS-T-Inserts */
  insertedVersionIds: string[];
  /** E-Mail des schliessenden Benutzers */
  userEmail: string;
  /** Bearbeitungskommentar */
  editComment: string;
  /** Reservierte Versionsnummer (vor WFS-T-Insert ermittelt) */
  versionNr: number;
}

export interface CommitContainerResult extends SessionCloseResponse {
  /** Fortlaufende Versionsnummer innerhalb des Containers */
  version_nr: number;
  /** Anzahl der per WFS-T inserierten Features */
  features_saved: number;
  /** Anzahl der per SQL kopierten (unveränderten) Features */
  features_copied: number;
}

// =============================================================================
// PUBLIC API  –  jede Funktion managt ihre eigene DB-Transaktion
// =============================================================================

/**
 * Öffnet eine neue Workflow-Session (Schritte 1–3 in einer Transaktion).
 *
 * 1. Version 0 idempotent anlegen (für ALLE Features des Containers)
 * 2. Session-Record in wf_sessions (state = 'active')
 * 3. Feature-Status auf 'in_bearbeitung' setzen (für alle Container-Features)
 * 4. Nächste version_nr reservieren (SELECT MAX + 1)
 *
 * @returns SessionOpenResult mit session_id, workflow_status und version_nr
 * @throws { code: 'SESSION_CONFLICT' }  bei 23505 (aktive Session existiert)
 * @throws { code: 'INTERNAL_ERROR', cause }  bei sonstigen DB-Fehlern
 */
export async function openSession(
  params: OpenSessionParams,
): Promise<SessionOpenResult> {
  try {
    return await params.sql.begin(async (tx) => {
      // Schritt 1: Version 0 für alle Container-Features (idempotent)
      await ensureVersion0ForContainer(
        tx,
        params.schema,
        params.body.feature_type,
        params.body.feature_set_id,
      );

      // Schritt 2: Session öffnen
      const sessionId: number = await insertSessionRecord(
        tx,
        params.schema,
        params.body,
        params.userEmail,
      );

      // Schritt 3: Feature-Status → 'in_bearbeitung' für alle Container-Features
      const fhNr = params.body.feature_set_id.replace(/^fh_/, "");
      await setContainerFeatureStatusInProgress(
        tx,
        params.schema,
        params.body.feature_type,
        fhNr,
        sessionId,
      );

      // Schritt 4: Nächste version_nr reservieren
      const versionTable = resolveVersionTable(params.body.feature_type);
      const fkCol = `${params.body.feature_type}_id`;
      const [maxRow] = await tx`
        SELECT COALESCE(MAX(version_nr), 0) + 1 AS next_nr
        FROM ${tx(params.schema)}.${tx(versionTable)}
        WHERE ${tx(fkCol)} IN (
          SELECT p2d2_uuid
          FROM ${tx(params.schema)}.${tx(resolveSourceTable(params.body.feature_type))}
          WHERE fh_nr = ${fhNr}
        )
      `;
      const reservedVersionNr: number = Number(maxRow?.next_nr ?? 1);

      return {
        session_id: sessionId,
        workflow_status: "in_bearbeitung" as const,
        version_nr: reservedVersionNr,
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

// ---------------------------------------------------------------------------
// Container-Helfer
// ---------------------------------------------------------------------------

/**
 * Legt Version 0 für ALLE Features eines Containers an (idempotent).
 *
 * Parst fh_nr aus feature_set_id ("fh_33" → "33") und selektiert
 * alle p2d2_uuid-Werte der Quelltabelle WHERE fh_nr = fhNr.
 * Für jede UUID wird ensureVersion0() aufgerufen (bestehende überspringen).
 *
 * @throws Error wenn eines der Features in der Quelltabelle nicht existiert
 */
export async function ensureVersion0ForContainer(
  tx: DbClient,
  schema: string,
  featureType: string,
  featureSetId: string,
): Promise<void> {
  const fhNr = featureSetId.replace(/^fh_/, "");
  const sourceTable = resolveSourceTable(featureType);
  const uuids = await tx`
    SELECT p2d2_uuid
    FROM ${tx(schema)}.${tx(sourceTable)}
    WHERE fh_nr = ${fhNr}
  `;
  for (const row of uuids) {
    await ensureVersion0(tx, schema, featureType, row.p2d2_uuid);
  }
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
        feature_uuid,
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
        ${body.feature_uuid ?? null},
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
    return toSafeId(row.id);
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
 * Setzt den Feature-Status auf 'in_bearbeitung' für ALLE Features eines
 * Containers (bestimmt durch fh_nr, z. B. "33").
 *
 * Führt ein INSERT ... SELECT mit ON CONFLICT UPSERT aus – idempotent.
 */
export async function setContainerFeatureStatusInProgress(
  tx: DbClient,
  schema: string,
  featureType: string,
  fhNr: string,
  sessionId: number,
): Promise<void> {
  const sourceTable = resolveSourceTable(featureType);
  await tx`
    INSERT INTO ${tx(schema)}.${tx("wf_feature_status")} (
      feature_type,
      feature_id,
      state,
      last_session_id
    )
    SELECT ${featureType}, p2d2_uuid, 'in_bearbeitung', ${sessionId}
    FROM ${tx(schema)}.${tx(sourceTable)}
    WHERE fh_nr = ${fhNr}
    ON CONFLICT (feature_type, feature_id)
    DO UPDATE SET
      state           = 'in_bearbeitung',
      last_session_id = ${sessionId},
      updated_at      = now()
  `;
}

/**
 * Erzeugt einen Snapshot-Eintrag in wf_snapshots (is_final=true, kind='manual').
 * Speichert optional die version_nr für die Wiederherstellung (Recovery).
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
  versionNr: number = 0,
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
      version_nr,
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
      ${versionNr || null},
      ${snapshotNo},
      true,
      'manual',
      ${userEmail},
      ${featureUuid}
    )
    RETURNING id
  `;

  return toSafeId(row.id);
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

// =============================================================================
// CONTAINER-VERSION: Commit finalisieren
// =============================================================================

/**
 * Finalisiert eine Container-Version in einer DB-Transaktion.
 *
 * 1. version_nr verifizieren (SELECT MAX + 1, Warnung bei Abweichung)
 * 2. Unmodifizierte Features des Containers kopieren (INSERT ... SELECT)
 * 3. Snapshot + Session schliessen (wf_sessions + wf_feature_status)
 *
 * @returns CommitContainerResult mit session_id, version_nr, features_saved, features_copied
 * @throws { code: 'INTERNAL_ERROR', cause }  bei DB-Fehlern
 */
export async function commitContainerVersion(
  params: CommitContainerParams,
): Promise<CommitContainerResult> {
  const {
    sql,
    schema,
    sessionId,
    featureType,
    featureSetId,
    modifiedUuids,
    insertedVersionIds,
    userEmail,
    editComment,
    versionNr,
  } = params;

  const sourceTable = resolveSourceTable(featureType);
  const versionTable = resolveVersionTable(featureType);
  const fkCol = `${featureType}_id`;
  const fhNr = featureSetId.replace(/^fh_/, "");

  try {
    return await sql.begin(async (tx) => {
      // -------------------------------------------------------------------
      // Schritt 1: version_nr verifizieren
      // -------------------------------------------------------------------
      console.log(
        `[commitContainerVersion] prüfe version_nr=${versionNr} für ${insertedVersionIds.length} WFS-T-Zeile(n)`,
      );
      // Prüfen, ob alle WFS-T-Inserts die korrekte reservedVersionNr tragen
      const [mismatch] = await tx`
        SELECT COUNT(*) AS cnt
        FROM ${tx(schema)}.${tx(versionTable)}
        WHERE version_id = ANY(${insertedVersionIds})
          AND version_nr <> ${versionNr}
      `;
      if (Number(mismatch?.cnt ?? 0) > 0) {
        console.warn(
          `[commitContainerVersion] ❌ ${mismatch.cnt} WFS-T-Zeile(n) haben falsche version_nr (erwartet ${versionNr})`,
        );
        throw new Error(
          `WFS-T-Inserts tragen nicht durchgehend version_nr=${versionNr}`,
        );
      }
      console.log(
        `[commitContainerVersion] ✅ alle ${insertedVersionIds.length} WFS-T-Zeile(n) haben version_nr=${versionNr}`,
      );

      // -------------------------------------------------------------------
      // Schritt 3: Vom Trigger kopierte Features zählen
      // -------------------------------------------------------------------
      // Der DB-Trigger fn_container_mitversionen() kopiert automatisch alle
      // unmodifizierten Features des Containers in die Versionentabelle.
      // Wir zählen hier, wie viele Zeilen der Trigger angelegt hat.
      const [copyCount] = await tx`
        SELECT COUNT(*) AS cnt
        FROM ${tx(schema)}.${tx(versionTable)}
        WHERE session_id = ${sessionId}
          AND version_nr = ${versionNr}
          AND is_session_boundary = FALSE
      `;
      const featuresCopied = Number(copyCount?.cnt ?? 0);
      console.log(
        `[commitContainerVersion] Trigger hat ${featuresCopied} unmodifizierte(s) Feature(s) kopiert`,
      );

      // -------------------------------------------------------------------
      // Schritt 4: Snapshot + Session schliessen
      // -------------------------------------------------------------------
      const representativeVersionId = insertedVersionIds[0];
      console.log(
        `[commitContainerVersion] erzeuge Snapshot für session_id=${sessionId} mit version_nr=${versionNr}`,
      );

      // Alle Container-UUIDs für wf_feature_status
      const allUuidsRows = await tx`
        SELECT p2d2_uuid
        FROM ${tx(schema)}.${tx(sourceTable)}
        WHERE fh_nr = ${fhNr}
      `;
      const containerUuids = allUuidsRows.map(
        (r: any) => r.p2d2_uuid as string,
      );

      const snapshotId: number = await insertSnapshotRecord(
        tx,
        schema,
        featureType,
        sessionId,
        modifiedUuids[0],
        representativeVersionId,
        userEmail,
        versionNr,
      );
      console.log(
        `[commitContainerVersion] Snapshot erzeugt: snapshot_id=${snapshotId}`,
      );

      // wf_sessions schliessen
      await tx`
        UPDATE ${tx(schema)}.${tx("wf_sessions")}
        SET state    = 'completed',
            ended_by = ${userEmail},
            ended_at = now()
        WHERE id = ${sessionId}
      `;
      console.log(
        `[commitContainerVersion] Session completed: session_id=${sessionId}`,
      );

      // wf_feature_status für alle Container-UUIDs auf qs1_ausstehend
      await tx`
        UPDATE ${tx(schema)}.${tx("wf_feature_status")}
        SET state           = 'qs1_ausstehend',
            last_session_id = ${sessionId},
            updated_at      = now()
        WHERE feature_type = ${featureType}
          AND feature_id   = ANY(${containerUuids})
      `;
      console.log(
        `[commitContainerVersion] Feature-Status aktualisiert: feature_type=${featureType}`,
      );

      return {
        session_id: sessionId,
        version_id: representativeVersionId,
        snapshot_id: snapshotId,
        workflow_status: "qs1_ausstehend" as const,
        version_nr: versionNr,
        features_saved: insertedVersionIds.length,
        features_copied: Number(featuresCopied),
      };
    });
  } catch (err: unknown) {
    throw { code: "INTERNAL_ERROR" as const, cause: err };
  }
}
