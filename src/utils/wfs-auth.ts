/**
 * WFS Client
 * Handles WFS requests with support for both anonymous (read) and authenticated (WFS-T) access.
 *
 * Read access: Anonymous (no credentials required)
 * Write access (WFS-T): Requires explicit credentials via createWFSTClient()
 */

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
function isLocalDevEnvironment(): boolean {
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

    // Environment-spezifische Defaults
    // Weiche für dev/prod ohne import.meta.env Abhängigkeit

    // Für Development: Versuche zuerst globalen Endpoint
    const defaultEndpoint = isDev
      ? "https://wfs.data-dna.eu/geoserver/ows" // Development mit CORS-fähigem Endpoint
      : "https://wfs.data-dna.eu/geoserver/Verwaltungsdaten/ows"; // Production Endpoint

    // Read access is anonymous - no default credentials
    this.config = {
      endpoint: config.endpoint || defaultEndpoint,
      workspace: config.workspace || "Verwaltungsdaten",
      namespace: config.namespace || "urn:data-dna:govdata",
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
    const useGlobalEndpoint =
      this.config.endpoint.includes("/ows") &&
      !this.config.endpoint.includes(`/${this.config.workspace}/ows`);

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
   * Resolves the final read URL based on environment
   * - Local dev: uses proxy to bypass CORS
   * - Production: direct anonymous access
   */
  private resolveReadURL(url: string): string {
    if (isLocalDevEnvironment()) {
      const proxyUrl = `/api/wfs-proxy?url=${encodeURIComponent(url)}`;
      console.log(
        `[WFS] Dev mode: Using local proxy for read access`,
        proxyUrl,
      );
      return proxyUrl;
    }
    console.log(`[WFS] Using direct anonymous WFS access`, url);
    return url;
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
   * Uses proxy in local dev to bypass CORS, direct access in production
   */
  async fetchWFS(url: string, options: RequestInit = {}): Promise<Response> {
    try {
      // Resolve URL: proxy for local dev, direct for production
      const requestUrl = this.resolveReadURL(url);

      const response = await fetch(requestUrl, {
        ...options,
        headers: new Headers(options.headers),
      });

      if (!response.ok) {
        const text = await response.text();

        // Spezielle Behandlung für Namespace-Fehler
        if (text.includes("Unknown namespace")) {
          console.warn(
            `[WFS] Namespace error detected, trying alternative endpoint...`,
          );

          // Fallback: Globaler Endpoint
          const fallbackDirectUrl = url.replace(
            "/geoserver/Verwaltungsdaten/ows",
            "/geoserver/ows",
          );

          if (fallbackDirectUrl !== url) {
            // Apply proxy resolution to fallback URL as well
            const fallbackRequestUrl = this.resolveReadURL(fallbackDirectUrl);
            console.log(
              `[WFS] Retrying with global endpoint: ${fallbackRequestUrl}`,
            );
            return await fetch(fallbackRequestUrl, {
              ...options,
              headers: new Headers(options.headers),
            });
          }
        }

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
      const testUrl = this.buildWFSURL("p2d2_containers", {
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
      workspace: config.workspace || "Verwaltungsdaten",
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
