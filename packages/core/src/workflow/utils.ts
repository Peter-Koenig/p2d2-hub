// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// @p2d2/core — Workflow-Hilfsfunktionen (postgres-frei, über DbClient).
//
// Spalten-Discovery, Feature-Daten-Lesen, SQL-Identifier-Quoting und
// Stage-Auflösung aus der URL. Die Tabellen-Namens-Mappings liegen in
// `../wfst/table-names`.
import type { FeatureData } from "../wfst/wfst";
import { resolveSourceTable } from "../wfst/table-names";
import type { DbClient } from "../db/types";

// ---------------------------------------------------------------------------
// Spalten-Discovery
// ---------------------------------------------------------------------------

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
      AND column_name NOT IN (${"p2d2_uuid"}, ${"geom"}, ${"created_at"}, ${"updated_at"})
    ORDER BY ordinal_position
  `;

  return rows.map((r) => r.column_name);
}

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

export async function getFeatureData(
  tx: DbClient,
  schema: string,
  featureType: string,
  featureUuid: string,
): Promise<FeatureData> {
  const sourceTable = resolveSourceTable(featureType);
  const domainFields = await getDomainFields(tx, schema, featureType);

  const domainColList = domainFields.map((c) => quoteIdent(c)).join(", ");

  const qualifiedTable = `${quoteIdent(schema)}.${quoteIdent(sourceTable)}`;

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

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// Stage-Auflösung aus der URL
// ---------------------------------------------------------------------------

export interface StageConfig {
  stage: string;
  geoPrefix: string;
}

export function resolveStageFromUrl(hostname: string): StageConfig {
  const GEO_PREFIX_EXCEPTIONS: Record<string, string> = {
    develop: "dev",
  };

  const host = hostname.split(":")[0].toLowerCase();

  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
    return { stage: "de1", geoPrefix: "de1" };
  }

  const subdomain = host.split(".")[0];

  if (subdomain === "www") {
    return { stage: "main", geoPrefix: "main" };
  }

  if (subdomain.startsWith("f-")) {
    const shortName = subdomain.slice(2);
    const geoPrefix = GEO_PREFIX_EXCEPTIONS[shortName] ?? shortName;
    return { stage: shortName, geoPrefix };
  }

  const geoPrefix = GEO_PREFIX_EXCEPTIONS[subdomain] ?? subdomain;
  return { stage: subdomain, geoPrefix };
}
