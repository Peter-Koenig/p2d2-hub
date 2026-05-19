// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
/**
 * WFS Client
 * Handles WFS requests with support for both anonymous (read) and authenticated (WFS-T) access.
 *
 * Read access: Anonymous (no credentials required)
 * - Primary read endpoint is derived from PUBLIC_WFST_ENDPOINT + PUBLIC_WFST_WORKSPACE
 *   Example: https://wfs.data-dna.eu/geoserver/ows + Verwaltungsdaten_de1
 *   => https://wfs.data-dna.eu/geoserver/Verwaltungsdaten_de1/ows
 * - All browser requests use /api/wfs-proxy to avoid origin-specific 403 errors
 * - Local dev and Staging/Prod both route through the proxy
 *
 * Write access (WFS-T): Requires explicit credentials via createWFSTClient()
 */

import { createWFSReadConfig } from "./wfs-read-config";

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

// Environment detection type
interface EnvironmentInfo {
  isDev: boolean;
  nodeEnv: string | undefined;
  hostname: string | undefined;
}

function detectEnvironment(): EnvironmentInfo {
  return {
    isDev:
      (typeof process !== "undefined" &&
        process.env.NODE_ENV === "development") ||
      (typeof window !== "undefined" &&
        window.location.hostname.includes("local")),
    nodeEnv: typeof process !== "undefined" ? process.env.NODE_ENV : undefined,
    hostname:
      typeof window !== "undefined" ? window.location.hostname : undefined,
  };
}

/**
 * Checks if running in local development environment
 * Local dev requires proxy to bypass CORS restrictions
 */
export function isLocalDevEnvironment(): boolean {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1";
  }

  if (typeof process !== "undefined") {
    return process.env.NODE_ENV === "development";
  }

  return false;
}

/**
 * WFS Client
 * Handles WFS requests with support for both anonymous (read) and authenticated (WFS-T) access.
 */
export class WFSAuthClient {
  private config: WFSConfig;

  constructor(config: Partial<WFSConfig> = {}) {
    // Environment detection using unified function
    const envInfo = detectEnvironment();
    const isDev = envInfo.isDev;

    // Derive stage-specific read endpoint from environment variables
    // Uses createWFSReadConfig which derives:
    //   PUBLIC_WFST_ENDPOINT=https://wfs.data-dna.eu/geoserver/ows
    //   PUBLIC_WFST_WORKSPACE=Verwaltungsdaten_de1
    //   => https://wfs.data-dna.eu/geoserver/Verwaltungsdaten_de1/ows
    //
    // Fail-fast: If PUBLIC_* env vars are missing or malformed, throw error.
    // No silent fallback to global workspace/endpoint to prevent misconfiguration.
    let readConfig: WFSConfig;
    try {
      readConfig = createWFSReadConfig({
        endpoint: config.endpoint,
        workspace: config.workspace,
        namespace: config.namespace,
      });
    } catch (error) {
      // Only allow fallback in test environment
      if (process.env.NODE_ENV === "test") {
        // Explicit test-only fallback - not for production/staging use
        readConfig = {
          endpoint: config.endpoint ?? "https://wfs.data-dna.eu/geoserver/ows",
          workspace: config.workspace ?? "Verwaltungsdaten",
          namespace: config.namespace ?? "urn:data-dna:govdata",
        };
      } else {
        // In all real environments: fail fast to expose config issues
        throw error;
      }
    }

    // Read access is anonymous - no default credentials
    this.config = {
      endpoint: readConfig.endpoint,
      workspace: readConfig.workspace,
      namespace: readConfig.namespace,
      credentials: config.credentials
        ? {
            username: config.credentials.username,
            password: config.credentials.password,
          }
        : undefined,
    };

    if (isDev) {
      console.log("[WFS] Configuration loaded:", {
        endpoint: this.config.endpoint,
        workspace: this.config.workspace,
        namespace: this.config.namespace,
        hasCredentials: !!(
          this.config.credentials?.username && this.config.credentials?.password
        ),
        timestamp: new Date().toISOString(),
      });
    }

    // Validierung der kritischen Konfiguration
    if (!this.config.endpoint) {
      throw new Error("[WFS] Endpoint configuration missing");
    }
  }

  /**
   * Validates if the configured workspace exists in GeoServer
   */
  async validateWorkspace(): Promise<boolean> {
    try {
      const capabilitiesUrl = `${this.config.endpoint.replace("/ows", "/wfs")}?service=WFS&version=2.0.0&request=GetCapabilities`;
      const response = await fetch(capabilitiesUrl);
      const text = await response.text();

      // Prüfe ob Workspace existiert
      const hasWorkspace =
        text.includes(`xmlns:${this.config.workspace}=`) ||
        text.includes(`<Name>${this.config.workspace}:`);

      console.log(
        `[WFS-Auth] Workspace '${this.config.workspace}' ${hasWorkspace ? "found" : "NOT FOUND"} in capabilities`,
      );
      return hasWorkspace;
    } catch (error) {
      console.error("[WFS-Auth] Workspace validation failed:", error);
      return false;
    }
  }

  /**
   * Builds a WFS GetFeature URL for anonymous read access
   *
   * Handles both workspace-specific endpoints (standard) and global endpoints (fallback):
   * - Workspace-specific: typeName is used as-is (e.g., "geo-containers")
   * - Global endpoint: typeName is prefixed with workspace (e.g., "Verwaltungsdaten:geo-containers")
   */
  buildWFSURL(typeName: string, params: Record<string, string> = {}): string {
    // Erlaubte Parameter definieren
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

    // Erkennung ob workspace-spezifischer oder globaler Endpoint
    // Standardfall: endpoint already contains workspace (e.g., /geoserver/Verwaltungsdaten_de1/ows)
    // Fallback: global endpoint (e.g., /geoserver/ows) requires workspace prefix in typeName
    const useGlobalEndpoint =
      this.config.endpoint.includes("/geoserver/ows") &&
      !this.config.endpoint.includes(`/geoserver/${this.config.workspace}/ows`);

    const baseParams = {
      service: "WFS",
      version: "2.0.0",
      request: "GetFeature",
      typeName: useGlobalEndpoint
        ? `${this.config.workspace}:${typeName}`
        : typeName,
      outputFormat: "application/json",
      srsName: "EPSG:4326",
      ...safeParams,
    };

    // Manueller URL-Bau um doppeltes Encoding zu vermeiden
    const queryString = Object.entries(baseParams)
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join("&");

    const wfsUrl = `${this.config.endpoint}?${queryString}`;

    console.log(`[WFS] Built URL: ${wfsUrl}`);
    return wfsUrl;
  }

  /**
   * Resolves the final read URL based on environment.
   *
   * - Local dev: uses /api/wfs-proxy to bypass CORS.
   * - Staging/Prod: also uses /api/wfs-proxy so that the browser only talks to
   *   the frontend origin, and WFS access runs server-side against wfs.data-dna.eu.
   *
   * This avoids origin-specific 403 responses from the WFS backend.
   */
  private resolveReadURL(url: string): string {
    // All environments (dev, staging, prod) use the WFS proxy
    // This ensures the browser only communicates with the frontend origin
    const proxyUrl = `/api/wfs-proxy?url=${encodeURIComponent(url)}`;
    console.log(`[WFS] Using WFS proxy for read access`, proxyUrl);
    return proxyUrl;
  }

  /**
   * Builds HTTP headers with authentication (only for WFS-T write operations)
   */
  private buildHeaders(existingHeaders?: HeadersInit): Headers {
    const headers = new Headers(existingHeaders);

    // Add Basic Auth only if valid credentials are provided
    if (
      this.config.credentials?.username?.trim() &&
      this.config.credentials?.password?.trim()
    ) {
      const authString = btoa(
        `${this.config.credentials.username}:${this.config.credentials.password}`,
      );
      headers.set("Authorization", `Basic ${authString}`);
    }

    return headers;
  }

  /**
   * Builds a WFS GetFeature URL with BBOX filter
   */
  buildBBoxWFSURL(
    typeName: string,
    bbox: number[],
    crs: string = "EPSG:4326",
  ): string {
    const [minx, miny, maxx, maxy] = bbox;
    return this.buildWFSURL(typeName, {
      bbox: `${minx},${miny},${maxx},${maxy},${crs}`,
      srsName: crs,
    });
  }

  /**
   * Fetches data from WFS endpoint (anonymous for read operations)
   * Uses /api/wfs-proxy in all environments (dev, staging, prod)
   */
  async fetchWFS(url: string, options: RequestInit = {}): Promise<Response> {
    try {
      // Resolve URL: always uses proxy (dev + staging/prod)
      const requestUrl = this.resolveReadURL(url);

      const response = await fetch(requestUrl, {
        ...options,
        headers: new Headers(options.headers),
      });

      if (!response.ok) {
        const text = await response.text();

        // No automatic fallback to global endpoint on namespace errors.
        // Fail fast to expose workspace/namespace misconfiguration.
        throw new Error(
          `WFS request failed: ${response.status} ${response.statusText}\n${text}`,
        );
      }

      return response;
    } catch (error) {
      console.error("[WFS] Request failed:", error);
      throw error;
    }
  }

  /**
   * Fetches GeoJSON features from WFS (anonymous read)
   */
  async getFeatures(
    typeName: string,
    params: Record<string, string> = {},
  ): Promise<any> {
    const url = this.buildWFSURL(typeName, params);
    const response = await this.fetchWFS(url);
    return response.json();
  }

  /**
   * Fetches features within a bounding box (anonymous read)
   */
  async getFeaturesInBBox(
    typeName: string,
    bbox: number[],
    crs: string = "EPSG:4326",
  ): Promise<any> {
    const url = this.buildBBoxWFSURL(typeName, bbox, crs);
    const response = await this.fetchWFS(url);
    return response.json();
  }

  /**
   * Executes a WFS-T transaction (requires credentials)
   */
  async executeWFSTransaction(transactionXml: string): Promise<Response> {
    const headers = new Headers({
      "Content-Type": "application/xml",
    });

    // Add Basic Auth for WFS-T write operations
    if (
      this.config.credentials?.username &&
      this.config.credentials?.password
    ) {
      const authString = btoa(
        `${this.config.credentials.username}:${this.config.credentials.password}`,
      );
      headers.set("Authorization", `Basic ${authString}`);
    }

    const response = await fetch(this.config.endpoint, {
      method: "POST",
      headers,
      body: transactionXml,
    });

    if (!response.ok) {
      throw new Error(
        `WFS-T transaction failed: ${response.status} ${response.statusText}`,
      );
    }

    return response;
  }

  /**
   * Checks if WFS endpoint is accessible (anonymous read test)
   * Uses GET with maxFeatures=1 instead of HEAD for better proxy compatibility
   */
  async testConnection(): Promise<boolean> {
    try {
      const testUrl = this.buildWFSURL("geo-containers", {
        maxFeatures: "1",
      });
      // Use GET instead of HEAD for better proxy/GeoServer compatibility
      const response = await this.fetchWFS(testUrl);
      return response.ok;
    } catch (error) {
      console.warn("WFS connection test failed:", error);
      return false;
    }
  }

  /**
   * Gets the current configuration
   */
  getConfig(): Readonly<WFSConfig> {
    return { ...this.config };
  }

  /**
   * Create WFS-T client with write credentials
   */
  static createWFSTClient(config: {
    endpoint: string;
    username?: string;
    password?: string;
    namespace?: string;
    workspace?: string;
  }): WFSAuthClient {
    return new WFSAuthClient({
      endpoint: config.endpoint,
      workspace: config.workspace,
      namespace: config.namespace || "urn:data-dna:govdata",
      credentials: {
        username: config.username || "",
        password: config.password || "",
      },
    });
  }
}

// Export singleton instance for anonymous read access
export const wfsAuthClient = new WFSAuthClient();
