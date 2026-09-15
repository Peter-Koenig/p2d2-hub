// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// @p2d2/core — Generischer WFS-T-Insert/Delete (XML-Bau + HTTP).
//
// Baut dynamisch WFS-T-Transaction-XML (WFS 2.0.0) und sendet es an den
// GeoServer. Umgebungsagnostisch: nutzt nur fetch/btoa/AbortSignal/Date,
// die in Browser UND Node 20 verfügbar sind.

import { resolveVersionTable } from "./table-names";

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

/** Konfiguration für den GeoServer-Zugriff (stage-spezifisch). */
export interface WfstConfig {
  /** WFS-T-Endpoint-URL (z. B. "https://wfs.data-dna.eu/geoserver/de1/ows") */
  endpoint: string;
  /** Basic-Auth-Benutzername (z. B. "p2d2_wfst_de1") */
  username: string;
  /** Basic-Auth-Passwort */
  password: string;
}

/** Struktur der Daten, die für den WFS-T-Export aus der DB gelesen werden. */
export interface FeatureData {
  /** GML 3.2-Geometrie (EPSG:4326) */
  geom_gml: string;
  /** Alle Domain-Attribute (Spaltenname → Wert) */
  attributes: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildGeoServerTypeName(featureType: string): string {
  const versionTable = resolveVersionTable(featureType);
  return versionTable.replace(/^p2d2_/, "");
}

function parseVersionIdFromResponse(responseXml: string): string {
  const match = responseXml.match(
    /rid="[^."]+\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/i,
  );
  if (!match) {
    throw new Error(
      "WFS-T-Response enthält keine gültige ResourceId – " +
        "möglicherweise ist der GeoServer-Layer nicht korrekt konfiguriert",
    );
  }
  return match[0].split(".")[1].replace(/"$/, "");
}

function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildWfstPayload(
  geoPrefix: string,
  featureType: string,
  sessionId: number,
  userEmail: string,
  editComment: string,
  featureUuid: string,
  featureData: FeatureData,
  versionNr: number,
  isSessionBoundary: boolean = true,
): string {
  const fkCol = `${featureType}_id`;
  const typeName = buildGeoServerTypeName(featureType);
  const namespace = `urn:data-dna:govdata:${geoPrefix}`;
  const createdAt = isoNow();

  const systemParts: string[] = [
    `<${geoPrefix}:${fkCol}>${xmlEscape(featureUuid)}</${geoPrefix}:${fkCol}>`,
    `<${geoPrefix}:version_nr>${versionNr}</${geoPrefix}:version_nr>`,
    `<${geoPrefix}:session_id>${sessionId}</${geoPrefix}:session_id>`,
    `<${geoPrefix}:is_session_boundary>${isSessionBoundary}</${geoPrefix}:is_session_boundary>`,
    `<${geoPrefix}:created_at>${createdAt}</${geoPrefix}:created_at>`,
    `<${geoPrefix}:created_by>${xmlEscape(userEmail)}</${geoPrefix}:created_by>`,
    `<${geoPrefix}:edit_comment>${xmlEscape(editComment)}</${geoPrefix}:edit_comment>`,
  ];

  const domainParts: string[] = [];
  for (const [colName, value] of Object.entries(featureData.attributes)) {
    if (value === null || value === undefined) continue;
    const xmlValue =
      typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : xmlEscape(String(value));
    domainParts.push(
      `<${geoPrefix}:${colName}>${xmlValue}</${geoPrefix}:${colName}>`,
    );
  }

  const geomPart = `<${geoPrefix}:geom>${featureData.geom_gml}</${geoPrefix}:geom>`;

  const insertBody = [...systemParts, ...domainParts, geomPart].join(
    "\n      ",
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction
    service="WFS" version="2.0.0"
    xmlns:wfs="http://www.opengis.net/wfs/2.0"
    xmlns:${geoPrefix}="${namespace}"
    xmlns:gml="http://www.opengis.net/gml/3.2"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <wfs:Insert>
    <${geoPrefix}:${typeName}>
      ${insertBody}
    </${geoPrefix}:${typeName}>
  </wfs:Insert>
</wfs:Transaction>`;
}

// ---------------------------------------------------------------------------
// Öffentliche API
// ---------------------------------------------------------------------------

export async function insertVersionWfst(
  geoPrefix: string,
  featureType: string,
  sessionId: number,
  userEmail: string,
  editComment: string,
  featureUuid: string,
  featureData: FeatureData,
  config: WfstConfig,
  versionNr: number = 999999,
  isSessionBoundary: boolean = true,
): Promise<string> {
  const payload = buildWfstPayload(
    geoPrefix,
    featureType,
    sessionId,
    userEmail,
    editComment,
    featureUuid,
    featureData,
    versionNr,
    isSessionBoundary,
  );

  const credentials = btoa(`${config.username}:${config.password}`);

  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
        Authorization: `Basic ${credentials}`,
      },
      body: payload,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (fetchError: unknown) {
    const msg =
      fetchError instanceof Error ? fetchError.message : String(fetchError);
    throw new Error(`WFS-T-Request fehlgeschlagen: ${msg}`);
  }

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `WFS-T HTTP ${response.status} ${response.statusText}: ${responseText.slice(0, 2000)}`,
    );
  }

  if (responseText.includes("ExceptionReport")) {
    throw new Error(`WFS-T ExceptionReport: ${responseText.slice(0, 2000)}`);
  }

  try {
    return parseVersionIdFromResponse(responseText);
  } catch (parseError: unknown) {
    const msg =
      parseError instanceof Error ? parseError.message : String(parseError);
    throw new Error(`${msg}. Response-Anfang: ${responseText.slice(0, 500)}`);
  }
}

export async function deleteVersionsWfst(
  geoPrefix: string,
  featureType: string,
  versionIds: string[],
  config: WfstConfig,
): Promise<void> {
  if (versionIds.length === 0) {
    console.log("[WFS-T Rollback] Keine versionIds zu löschen – überspringe");
    return;
  }

  const typeName = buildGeoServerTypeName(featureType);
  const namespace = `urn:data-dna:govdata:${geoPrefix}`;

  const resourceIds = versionIds
    .map((id) => `<fes:ResourceId rid="${typeName}.${id}"/>`)
    .join("\n      ");

  const payload = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:Transaction
    service="WFS" version="2.0.0"
    xmlns:wfs="http://www.opengis.net/wfs/2.0"
    xmlns:${geoPrefix}="${namespace}"
    xmlns:fes="http://www.opengis.net/fes/2.0"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <wfs:Delete typeName="${geoPrefix}:${typeName}">
    <fes:Filter>
      ${resourceIds}
    </fes:Filter>
  </wfs:Delete>
</wfs:Transaction>`;

  const credentials = btoa(`${config.username}:${config.password}`);

  console.log(
    `[WFS-T Rollback] Sende DELETE an ${config.endpoint} (${versionIds.length} IDs)`,
  );

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/xml",
      Authorization: `Basic ${credentials}`,
    },
    body: payload,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const respBody = await response.text().catch(() => "(kein Body)");
    console.error(
      `[WFS-T Rollback] DELETE fehlgeschlagen: HTTP ${response.status} ${response.statusText}`,
    );
    console.error(
      `[WFS-T Rollback] Response-Body (Auszug):`,
      respBody.slice(0, 1000),
    );
  } else {
    console.log("[WFS-T Rollback] DELETE erfolgreich");
  }
}
