// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Hilfsfunktionen für den generischen Session-Workflow.
//
// Resolved Tabellen- und Spaltennamen dynamisch anhand von feature_type.
// Dies ist der EINZIGE Ort im Code, an dem feature_type auf konkrete
// DB-Namen gemappt wird.

import type postgres from "postgres";
import type { FeatureData } from "../../types/workflow";

// ---------------------------------------------------------------------------
// Typ-Alias für DB-Verbindungen (Pool oder Transaktion)
// ---------------------------------------------------------------------------
// TransactionSql<{}> ist nicht zu Sql<{}> assignable, da es Connection-
// Management-Properties (CLOSE, END, …) nicht hat. Beide unterstützen
// aber Template-Literals, Identifier-Funktion und unsafe() – das ist
// alles, was die Workflow-Funktionen brauchen.
// ---------------------------------------------------------------------------
export type DbClient = postgres.Sql<{}> | postgres.TransactionSql<{}>;

// ---------------------------------------------------------------------------
// Tabellen-Namens-Mapping
// ---------------------------------------------------------------------------
// Ausnahmen für abweichende Pluralformen im Tabellennamen:
//   grabflur → p2d2_grabflure  (deutsches Plural-e)
//   grab     → p2d2_graeber    (Umlaut-Plural, falls jemals benötigt)
//   baum     → p2d2_baum       (kein Suffix – kein Eintrag nötig)
// ---------------------------------------------------------------------------
const TABLE_SUFFIX_MAP: Record<string, string> = {
  grabflur: "grabflure",
};

/** Liefert den suffigierten Tabellennamens-Teil für den feature_type. */
function tableSuffix(featureType: string): string {
  return TABLE_SUFFIX_MAP[featureType] ?? featureType;
}

/**
 * Ermittelt den Quell-Tabellennamen für einen feature_type.
 * @example resolveSourceTable('grabflur') → 'p2d2_grabflure'
 */
export function resolveSourceTable(featureType: string): string {
  return `p2d2_${tableSuffix(featureType)}`;
}

/**
 * Ermittelt den Versionen-Tabellennamen für einen feature_type.
 * @example resolveVersionTable('grabflur') → 'p2d2_grabflure_versionen'
 */
export function resolveVersionTable(featureType: string): string {
  return `p2d2_${tableSuffix(featureType)}_versionen`;
}

// ---------------------------------------------------------------------------
// Spalten-Discovery
// ---------------------------------------------------------------------------

/**
 * Systemspalten der Quelltabelle – diese werden NICHT als Domain-Spalten
 * betrachtet. Der FK in der Versionentabelle heisst `${featureType}_id`.
 */
const SOURCE_SYSTEM_COLS = ["p2d2_uuid", "geom"];

/**
 * Liefert alle Domain-Spalten der Quelltabelle (alles außer System-Spalten).
 *
 * @param tx          – Transaktions- oder Connection-Objekt
 * @param schema      – DB-Schema (z. B. "p2d2_de1")
 * @param featureType – Themen-Schlüssel (z. B. "grabflur")
 * @returns Array von Spaltennamen
 */
export async function getDomainFields(
  tx: DbClient,
  schema: string,
  featureType: string,
): Promise<string[]> {
  const sourceTable = resolveSourceTable(featureType);

  const rows: Array<{ column_name: string }> = await tx`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = ${schema}
      AND table_name   = ${sourceTable}
      AND column_name NOT IN (${"p2d2_uuid"}, ${"geom"})
    ORDER BY ordinal_position
  `;

  return rows.map((r) => r.column_name);
}

/**
 * Einfacher In-Memory-Cache für Domain-Fields pro (schema, featureType).
 * Der Cache lebt pro Prozess – im Dev-Hot-Reload kann er veralten,
 * was für p2d2 akzeptabel ist (Schema-Änderungen erfordern Neustart).
 */
const domainFieldsCache = new Map<string, string[]>();

export async function getCachedDomainFields(
  tx: DbClient,
  schema: string,
  featureType: string,
): Promise<string[]> {
  const cacheKey = `${schema}.${featureType}`;
  let fields = domainFieldsCache.get(cacheKey);
  if (!fields) {
    fields = await getDomainFields(tx, schema, featureType);
    domainFieldsCache.set(cacheKey, fields);
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Feature-Daten aus der Quelltabelle lesen
// ---------------------------------------------------------------------------

/**
 * Liest sämtliche Daten eines Features aus der Quelltabelle.
 *
 * Liefert:
 * - `geom_gml`  – Geometrie als GML 3.2 (EPSG:4326, 6 Dezimalstellen)
 * - `attributes` – Key-Value-Map aller Domain-Spalten (für WFS-T-XML)
 *
 * @param tx          – DB-Transaktion
 * @param schema      – DB-Schema
 * @param featureType – Themen-Schlüssel
 * @param featureUuid – p2d2_uuid des abzurufenden Objekts
 */
export async function getFeatureData(
  tx: postgres.Sql<{}>,
  schema: string,
  featureType: string,
  featureUuid: string,
): Promise<FeatureData> {
  const sourceTable = resolveSourceTable(featureType);
  const domainFields = await getDomainFields(tx, schema, featureType);

  // -----------------------------------------------------------------------
  // Dynamisches SQL bauen: Domain-Spalten + ST_AsGML für geom
  // -----------------------------------------------------------------------
  // Die Spaltennamen stammen aus information_schema (trusted source),
  // daher ist sql.unsafe() für den Struktur-Teil akzeptabel.
  // Der featureUuid-Parameter wird via $1 escaped.
  // -----------------------------------------------------------------------
  const domainColList = domainFields.map((c) => quoteIdent(c)).join(", ");

  const qualifiedTable = `${quoteIdent(schema)}.${quoteIdent(sourceTable)}`;

  // language=PostgreSQL
  const query = `
    SELECT ${domainColList},
           ST_AsGML(3, geom, 6, 1) AS geom_gml
    FROM ${qualifiedTable}
    WHERE p2d2_uuid = $1
    LIMIT 1
  `;

  const [row] = await tx.unsafe(query, [featureUuid]);
  if (!row) {
    throw new Error(`Feature ${featureUuid} in ${sourceTable} nicht gefunden`);
  }

  // Domain-Attribute extrahieren (alles außer geom_gml)
  const attributes: Record<string, unknown> = {};
  for (const col of domainFields) {
    attributes[col] = row[col] ?? null;
  }

  return {
    geom_gml: row.geom_gml as string,
    attributes,
  };
}

// ---------------------------------------------------------------------------
// Identifier-Quote-Hilfen
// ---------------------------------------------------------------------------

/**
 * Schützt einen SQL-Identifier vor Injection, indem doppelte Anführungszeichen
 * escaped und der Name in solche gehüllt wird.
 *
 * @example quoteIdent('fh_nr')  → '"fh_nr"'
 * @example quoteIdent('tab"le') → '"tab""le"'
 */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// Stage-Auflösung aus der URL
// ---------------------------------------------------------------------------

/**
 * Ergebnis der Stage-Auflösung.
 *
 * `stage`     – Name des DB-Schemas (z. B. "develop", "de1")
 * `geoPrefix` – GeoServer-Workspace/Namespace-Prefix (z. B. "dev", "de1")
 *
 * Beide Werte können voneinander abweichen (siehe Sonderfall develop → dev).
 */
export interface StageConfig {
  stage: string;
  geoPrefix: string;
}

/**
 * Leitet die Stage (DB-Schema) und den GeoServer-Prefix aus dem
 * aufgerufenen Hostnamen ab.
 *
 * Mapping-Regeln:
 *   www.data-dna.eu          → stage="main",   geoPrefix="main"
 *   dev.data-dna.eu          → stage="develop", geoPrefix="dev"    ← Sonderfall
 *   f-{name}.data-dna.eu     → stage={name},   geoPrefix={name}
 *   localhost / 127.0.0.1    → stage="de1",    geoPrefix="de1"    (Dev-Fallback)
 *   unbekannt                → stage="de1",    geoPrefix="de1"    (Fallback)
 *
 * Zukünftige Erweiterung:
 *   Neue f-*-Stages (f-en1, f-br1, f-de3, …) funktionieren ohne Code-Änderung,
 *   da lediglich der Subdomain-Name extrahiert wird. Benötigen sie einen
 *   abweichenden GeoServer-Prefix, muss hier eine Ausnahme hinterlegt werden.
 *
 * @param hostname – Hostname aus dem Request (z. B. "f-de1.data-dna.eu")
 */
export function resolveStageFromUrl(hostname: string): StageConfig {
  // Schema für Stages mit abweichendem GeoServer-Prefix
  const GEO_PREFIX_EXCEPTIONS: Record<string, string> = {
    develop: "dev",
  };

  // Hostname normalisieren (Port entfernen, falls vorhanden)
  const host = hostname.split(":")[0].toLowerCase();

  // Lokale/IP-Fälle – Default auf de1
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
    return { stage: "de1", geoPrefix: "de1" };
  }

  // Subdomain extrahieren (erster Teil vor dem ersten Punkt)
  const subdomain = host.split(".")[0];

  // Explizite Vollqualifizierung: "www" → main
  if (subdomain === "www") {
    return { stage: "main", geoPrefix: "main" };
  }

  // f-*-Subdomains: z. B. "f-de1" → stage="de1", "f-de3" → stage="de3"
  if (subdomain.startsWith("f-")) {
    const shortName = subdomain.slice(2); // "de1", "de2", "fv", "en1", …
    const geoPrefix = GEO_PREFIX_EXCEPTIONS[shortName] ?? shortName;
    return { stage: shortName, geoPrefix };
  }

  // Alle anderen Subdomains (z. B. "dev") → direkt als Stage-Name
  const geoPrefix = GEO_PREFIX_EXCEPTIONS[subdomain] ?? subdomain;
  return { stage: subdomain, geoPrefix };
}
