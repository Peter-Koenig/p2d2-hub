// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Generischer WFS-T-Insert für den Session-Workflow.
//
// Baut dynamisch ein WFS-T-Transaction-XML (WFS 2.0.0) und sendet es
// an den GeoServer. Die Payload enthält:
//   - System-Spalten (FK, version_nr, session_id, …)
//   - Domain-Attribute (dynamisch aus FeatureData.attributes)
//   - Geometrie als GML 3.2 (EPSG:4326)
//
// Die GeoServer-Layer-Art (featureTypeName) wird aus dem DB-Tabellennamen
// abgeleitet, indem das Präfix "p2d2_" entfernt wird.
//   Beispiel: p2d2_grabflure_versionen → grabflure_versionen

import type { FeatureData } from "../../types/workflow";
import { resolveVersionTable } from "./utils";

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

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Escaped XML-Sonderzeichen für den Inhalt eines XML-Text-Knotens.
 *
 * @example xmlEscape('Meier & Sohn') → 'Meier &amp; Sohn'
 * @example xmlEscape('a < b && b > c') → 'a &lt; b &amp;&amp; b &gt; c'
 */
function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Bildet den GeoServer-FeatureType-Namen aus dem DB-Tabellennamen.
 *
 * Der GeoServer-Layer heisst wie die Versionentabelle ohne das
 * Präfix "p2d2_".
 *
 * @example buildGeoServerTypeName('grabflur') → 'grabflure_versionen'
 * @example buildGeoServerTypeName('baum')     → 'baum_versionen'
 */
function buildGeoServerTypeName(featureType: string): string {
  const versionTable = resolveVersionTable(featureType);
  // Entferne das "p2d2_"-Präfix, wenn vorhanden
  return versionTable.replace(/^p2d2_/, "");
}

/**
 * Parst die version_id (UUID) aus der GeoServer-WFS-T-Response.
 *
 * Erwartet ein XML-Element der Form:
 *   <fes:ResourceId rid="grabflure_versionen.{uuid}"/>
 *
 * @param responseXml – Die komplette XML-Response des GeoServers
 * @returns Die geparste UUID (z. B. "799a1e07-e906-42c7-a8ef-922e31e8ffde")
 * @throws Error wenn keine gültige ResourceId gefunden wurde
 */
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
  // Extrahiere die UUID (alles nach dem Punkt bis zum schliessenden ")
  const uuid = match[0].split(".")[1].replace(/"$/, "");
  return uuid;
}

/**
 * Erzeugt den ISO-8601-Zeitstempel im Format "2026-05-27T11:17:16Z".
 * Ohne Millisekunden – entspricht dem Format des Shell-Referenzskripts.
 */
function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ---------------------------------------------------------------------------
// WFS-T-XML bauen
// ---------------------------------------------------------------------------

/**
 * Baut die vollständige WFS-Transaction-Payload als XML-String.
 *
 * @param geoPrefix   – GeoServer-Namespace-Prefix (z. B. "de1", "dev")
 * @param featureType – Themen-Schlüssel (z. B. "grabflur")
 * @param sessionId   – ID der aktiven Session
 * @param userEmail   – E-Mail des Bearbeiters
 * @param editComment – Bearbeitungskommentar
 * @param featureUuid – UUID des Fachobjekts
 * @param featureData – Geometrie (GML) + Domain-Attribute
 * @returns Vollständiges WFS-Transaction-XML (WFS 2.0.0)
 */
function buildWfstPayload(
  geoPrefix: string,
  featureType: string,
  sessionId: number,
  userEmail: string,
  editComment: string,
  featureUuid: string,
  featureData: FeatureData,
  versionNr: number,
): string {
  const fkCol = `${featureType}_id`;
  const typeName = buildGeoServerTypeName(featureType);
  const namespace = `urn:data-dna:govdata:${geoPrefix}`;
  const createdAt = isoNow();

  // -----------------------------------------------------------------------
  // System-Spalten (immer vorhanden)
  // -----------------------------------------------------------------------
  const systemParts: string[] = [
    `<${geoPrefix}:${fkCol}>${xmlEscape(featureUuid)}</${geoPrefix}:${fkCol}>`,
    `<${geoPrefix}:version_nr>${versionNr}</${geoPrefix}:version_nr>`,
    `<${geoPrefix}:session_id>${sessionId}</${geoPrefix}:session_id>`,
    `<${geoPrefix}:is_session_boundary>true</${geoPrefix}:is_session_boundary>`,
    `<${geoPrefix}:created_at>${createdAt}</${geoPrefix}:created_at>`,
    `<${geoPrefix}:created_by>${xmlEscape(userEmail)}</${geoPrefix}:created_by>`,
    `<${geoPrefix}:edit_comment>${xmlEscape(editComment)}</${geoPrefix}:edit_comment>`,
  ];

  // -----------------------------------------------------------------------
  // Domain-Attribute (nur nicht-NULL-Werte)
  // -----------------------------------------------------------------------
  const domainParts: string[] = [];
  for (const [colName, value] of Object.entries(featureData.attributes)) {
    if (value === null || value === undefined) continue;
    // Zahl oder Boolean ohne Escaping, Strings mit Escaping
    const xmlValue =
      typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : xmlEscape(String(value));
    domainParts.push(
      `<${geoPrefix}:${colName}>${xmlValue}</${geoPrefix}:${colName}>`,
    );
  }

  // -----------------------------------------------------------------------
  // Geometrie (GML)
  // -----------------------------------------------------------------------
  const geomPart = `<${geoPrefix}:geom>${featureData.geom_gml}</${geoPrefix}:geom>`;

  // -----------------------------------------------------------------------
  // Alles zusammenbauen
  // -----------------------------------------------------------------------
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

// ===========================================================================
// Öffentliche API
// ===========================================================================

/**
 * Führt einen WFS-T-Insert für die Versionentabelle durch.
 *
 * Baut die XML-Payload dynamisch aus den übergebenen Daten, sendet sie
 * per HTTP-POST an den GeoServer und parst die version_id aus der Response.
 *
 * Ablauf:
 *   1. SQL-loses Ermitteln der GeoServer-Layer-Art aus featureType
 *   2. XML-Payload bauen (system + domain columns + GML-Geometrie)
 *   3. HTTP-POST mit Basic-Auth
 *   4. Response parsen → version_id (UUID)
 *
 * @param geoPrefix   – GeoServer-Namespace-Prefix (z. B. "de1", "dev")
 * @param featureType – Themen-Schlüssel (z. B. "grabflur")
 * @param sessionId   – ID der aktiven Session
 * @param userEmail   – E-Mail des Bearbeiters
 * @param editComment – Freitext-Kommentar
 * @param featureUuid – UUID des Fachobjekts
 * @param featureData – FeatureData mit geom_gml + attributes
 * @param config      – GeoServer-Endpoint + Credentials
 * @returns version_id (UUID) – z. B. "799a1e07-e906-42c7-a8ef-922e31e8ffde"
 * @throws Error bei HTTP-Fehlern, fehlerhafter Response oder Timeout
 */
export async function insertVersionWfst(
  geoPrefix: string,
  featureType: string,
  sessionId: number,
  userEmail: string,
  editComment: string,
  featureUuid: string,
  featureData: FeatureData,
  config: WfstConfig,
  versionNr: number = -1,
): Promise<string> {
  // -----------------------------------------------------------------------
  // XML-Payload bauen
  // -----------------------------------------------------------------------
  const payload = buildWfstPayload(
    geoPrefix,
    featureType,
    sessionId,
    userEmail,
    editComment,
    featureUuid,
    featureData,
    versionNr,
  );

  // -----------------------------------------------------------------------
  // HTTP-Request an GeoServer
  // -----------------------------------------------------------------------
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
      // Timeout: 30 Sekunden (GeoServer kann bei grossen GMLs laenger brauchen)
      signal: AbortSignal.timeout(30_000),
    });
  } catch (fetchError: unknown) {
    const msg =
      fetchError instanceof Error ? fetchError.message : String(fetchError);
    throw new Error(`WFS-T-Request fehlgeschlagen: ${msg}`);
  }

  // -----------------------------------------------------------------------
  // Response auswerten
  // -----------------------------------------------------------------------
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `WFS-T HTTP ${response.status} ${response.statusText}: ${responseText.slice(0, 2000)}`,
    );
  }

  // ExceptionReport (HTTP 200 mit Fehler im Body) erkennen
  if (responseText.includes("ExceptionReport")) {
    throw new Error(`WFS-T ExceptionReport: ${responseText.slice(0, 2000)}`);
  }

  // -----------------------------------------------------------------------
  // version_id aus ResourceId parsen
  // -----------------------------------------------------------------------
  try {
    return parseVersionIdFromResponse(responseText);
  } catch (parseError: unknown) {
    const msg =
      parseError instanceof Error ? parseError.message : String(parseError);
    // Debug: ersten 500 Zeichen der Response anhängen
    throw new Error(`${msg}. Response-Anfang: ${responseText.slice(0, 500)}`);
  }
}

// ===========================================================================
// WFS-T Rollback
// ===========================================================================

/**
 * Löscht WFS-T-Versionseinträge per WFS-T-Delete (Rollback bei Fehler).
 *
 * Baut ein WFS 2.0.0 Transaction/Delete-Request mit ResourceId-Filtern
 * f�r alle �bergebenen version_ids.
 *
 * @param geoPrefix   GeoServer-Namespace-Prefix (z. B. "de1")
 * @param featureType Themen-Schl�ssel (z. B. "grabflur")
 * @param versionIds  Array von UUIDs die gel�scht werden sollen
 * @param config      GeoServer-Endpoint + Credentials
 */
export async function deleteVersionsWfst(
  geoPrefix: string,
  featureType: string,
  versionIds: string[],
  config: WfstConfig,
): Promise<void> {
  if (versionIds.length === 0) return;

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
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/xml",
      Authorization: `Basic ${credentials}`,
    },
    body: payload,
    signal: AbortSignal.timeout(30_000),
  });

  // Fehler beim Rollback werden geloggt, aber nicht weiter geworfen
  // (der eigentliche Fehler aus dem Insert-Flow hat Vorrang)
  if (!response.ok) {
    console.error(
      `[WFS-T Rollback] DELETE fehlgeschlagen: ${response.status} ${response.statusText}`,
    );
  }
}
