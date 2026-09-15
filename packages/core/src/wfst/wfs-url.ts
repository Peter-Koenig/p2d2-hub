// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// @p2d2/core — Reine WFS-URL-/Request-Bau-Logik (umgebungsagnostisch).
//
// Keine Umgebungserkennung (window/process/import.meta.env) und kein
// /api/wfs-proxy — das bleibt in der App. `btoa` wird bewusst genutzt, da
// es in Browser UND Node 20 als Global verfügbar ist.

export interface WFSCredentials {
  username: string;
  password: string;
}

export interface WFSConfig {
  endpoint: string;
  workspace: string;
  namespace: string;
  credentials?: WFSCredentials;
}

export interface WFSReadConfig {
  endpoint: string;
  workspace: string;
  namespace: string;
}

/** Leitet aus dem globalen Endpoint den workspace-spezifischen Endpoint ab. */
export function deriveWorkspaceEndpoint(
  baseEndpoint: string,
  workspace: string,
): string {
  return baseEndpoint.replace(
    "/geoserver/ows",
    `/geoserver/${workspace}/ows`,
  );
}

/** Baut eine WFS-GetFeature-URL (anonymous read). */
export function buildWFSURL(
  config: WFSConfig,
  typeName: string,
  params: Record<string, string> = {},
): string {
  const allowedParams = [
    "bbox",
    "maxFeatures",
    "CQL_FILTER",
    "propertyName",
    "sortBy",
  ];
  const safeParams = Object.fromEntries(
    Object.entries(params).filter(([key]) => allowedParams.includes(key)),
  );

  const useGlobalEndpoint =
    config.endpoint.includes("/geoserver/ows") &&
    !config.endpoint.includes(`/geoserver/${config.workspace}/ows`);

  const baseParams = {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: useGlobalEndpoint
      ? `${config.workspace}:${typeName}`
      : typeName,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    ...safeParams,
  };

  const queryString = Object.entries(baseParams)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join("&");

  return `${config.endpoint}?${queryString}`;
}

/** Baut eine WFS-GetFeature-URL mit BBOX-Filter. */
export function buildBBoxWFSURL(
  config: WFSConfig,
  typeName: string,
  bbox: number[],
  crs: string = "EPSG:4326",
): string {
  const [minx, miny, maxx, maxy] = bbox;
  return buildWFSURL(config, typeName, {
    bbox: `${minx},${miny},${maxx},${maxy},${crs}`,
    srsName: crs,
  });
}

/** Baut den Basic-Auth-Header für WFS-T-Schreibzugriffe. */
export function buildBasicAuthHeader(credentials: WFSCredentials): string {
  const authString = btoa(
    `${credentials.username}:${credentials.password}`,
  );
  return `Basic ${authString}`;
}
