/**
 * WFS Authorization Client
 * Handles authentication and authorized requests to WFS endpoints
 */

export interface WFSCredentials {
  username: string;
  password: string;
}

export interface WFSConfig {
  endpoint: string;
  workspace: string;
  namespace: string;
  credentials: WFSCredentials;
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
 * WFS Authorization Client
 * Handles authentication and authorized requests to WFS endpoints
 */

export interface WFSCredentials {
  username: string;
  password: string;
}

export interface WFSConfig {
  endpoint: string;
  workspace: string;
  namespace: string;
  credentials: WFSCredentials;
}

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

    // TODO: Issue https://gitlab.opencode.de/OC000028072444/p2d2/-/issues/1 - Remove hardcoded credentials once anonymous GeoServer access is configured
    // These are temporary read-only credentials that will be replaced with anonymous access
    const RO_USERNAME = "p2d2_wfs_user"; // Echter Read-Only User
    const RO_PASSWORD = "eif1nu4ao9Loh0oobeev"; // Echtes Read-Only Passwort

    // Log warning in development about temporary credentials
    if (isDev && RO_USERNAME === "p2d2_wfs_user") {
      console.warn(
        "[WFS-Auth] Using temporary hardcoded read-only credentials. See Issue https://gitlab.opencode.de/OC000028072444/p2d2/-/issues/1 for roadmap to anonymous access.",
      );
    }

    this.config = {
      endpoint: config.endpoint || defaultEndpoint,
      workspace: config.workspace || "Verwaltungsdaten",
      namespace: config.namespace || "urn:data-dna:govdata",
      credentials: {
        username: config.credentials?.username || RO_USERNAME,
        password: config.credentials?.password || RO_PASSWORD,
      },
    };

    if (isDev) {
      console.log("[WFS-Auth] Configuration loaded:", {
        endpoint: this.config.endpoint,
        workspace: this.config.workspace,
        namespace: this.config.namespace,
        hasUsername: !!this.config.credentials.username,
        hasPassword: !!this.config.credentials.password,
      });
    }

    // Validierung der kritischen Konfiguration
    if (!this.config.endpoint) {
      throw new Error("[WFS-Auth] Endpoint configuration missing");
    }

    // Enhanced logging for debugging
    if (isDev) {
      console.log("[WFS-Auth] Configuration loaded:", {
        endpoint: this.config.endpoint,
        workspace: this.config.workspace,
        hasCredentials: !!(
          this.config.credentials.username && this.config.credentials.password
        ),
        usingProxy: true,
        timestamp: new Date().toISOString(),
      });
    }

    // Warnung wenn Credentials fehlen
    if (
      !this.config.credentials.username ||
      !this.config.credentials.password
    ) {
      console.warn("[WFS-Auth] Missing credentials - requests may fail");
    }
  }

  // ... Rest der Methoden bleibt unverändert ...

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
   * Builds a WFS GetFeature URL with authorization parameters
   */
  buildAuthorizedWFSURL(
    typeName: string,
    params: Record<string, string> = {},
  ): string {
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
      version: "2.0.0", // Upgrade auf WFS 2.0.0 für bessere Namespace-Behandlung
      request: "GetFeature",
      typeName: useGlobalEndpoint
        ? `${this.config.workspace}:${typeName}`
        : typeName, // Bei workspace-spezifischem Endpoint ohne Prefix
      outputFormat: "application/json", // Oder "text/xml" falls JSON nicht funktioniert
      srsName: "EPSG:4326",
      ...safeParams,
    };

    // Manueller URL-Bau um doppeltes Encoding zu vermeiden
    const queryString = Object.entries(baseParams)
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join("&");

    const wfsUrl = `${this.config.endpoint}?${queryString}`;

    // Proxy-URL für CORS-Umgehung verwenden
    const encodedWfsUrl = encodeURIComponent(wfsUrl);
    const proxyUrl = `/api/wfs-proxy?url=${encodedWfsUrl}`;

    console.log(`[WFS-Auth] Built Proxy URL: ${proxyUrl}`);
    return proxyUrl;
  }

  /**
   * Builds HTTP headers with authentication
   */
  private buildHeaders(existingHeaders?: HeadersInit): Headers {
    const headers = new Headers(existingHeaders);

    // Add Basic Auth only if valid credentials are provided
    if (
      this.config.credentials.username?.trim() &&
      this.config.credentials.password?.trim() &&
      this.config.credentials.username !== "" &&
      this.config.credentials.password !== ""
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
    return this.buildAuthorizedWFSURL(typeName, {
      bbox: `${minx},${miny},${maxx},${maxy},${crs}`,
      srsName: crs,
    });
  }

  /**
   * Fetches data from WFS endpoint with authentication
   */
  async fetchWithAuth(
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    try {
      // Für Proxy-Requests keine zusätzlichen Headers benötigt
      const isProxyRequest = url.startsWith("/api/wfs-proxy");

      const response = await fetch(url, {
        ...options,
        headers: isProxyRequest
          ? new Headers(options.headers)
          : this.buildHeaders(options.headers),
        credentials: "include" as RequestCredentials,
      });

      if (!response.ok) {
        const text = await response.text();

        // Spezielle Behandlung für Namespace-Fehler (nur bei direkten WFS-Requests)
        if (!isProxyRequest && text.includes("Unknown namespace")) {
          console.warn(
            `[WFS-Auth] Namespace error detected, trying alternative endpoint...`,
          );

          // Fallback: Globaler Endpoint
          const fallbackUrl = url.replace(
            "/geoserver/Verwaltungsdaten/ows",
            "/geoserver/ows",
          );

          if (fallbackUrl !== url) {
            console.log(
              `[WFS-Auth] Retrying with global endpoint: ${fallbackUrl}`,
            );
            return await fetch(fallbackUrl, {
              ...options,
              headers: this.buildHeaders(options.headers),
              credentials: "include" as RequestCredentials,
            });
          }
        }

        throw new Error(
          `WFS request failed: ${response.status} ${response.statusText}\n${text}`,
        );
      }

      return response;
    } catch (error) {
      console.error("[WFS-Auth] Request failed:", error);
      throw error;
    }
  }

  /**
   * Fetches GeoJSON features from WFS
   */
  async getFeatures(
    typeName: string,
    params: Record<string, string> = {},
  ): Promise<any> {
    const url = this.buildAuthorizedWFSURL(typeName, params);
    const response = await this.fetchWithAuth(url);
    return response.json();
  }

  /**
   * Fetches features within a bounding box
   */
  async getFeaturesInBBox(
    typeName: string,
    bbox: number[],
    crs: string = "EPSG:4326",
  ): Promise<any> {
    const url = this.buildBBoxWFSURL(typeName, bbox, crs);
    const response = await this.fetchWithAuth(url);
    return response.json();
  }

  /**
   * Executes a WFS-T transaction
   */
  async executeWFSTransaction(transactionXml: string): Promise<Response> {
    const headers = new Headers({
      "Content-Type": "application/xml",
    });

    if (this.config.credentials.username && this.config.credentials.password) {
      const authString = btoa(
        `${this.config.credentials.username}:${this.config.credentials.password}`,
      );
      headers.set("Authorization", `Basic ${authString}`);
    }

    const response = await fetch(this.config.endpoint, {
      method: "POST",
      headers,
      body: transactionXml,
      credentials: "include" as RequestCredentials,
    });

    if (!response.ok) {
      throw new Error(
        `WFS-T transaction failed: ${response.status} ${response.statusText}`,
      );
    }

    return response;
  }

  /**
   * Checks if WFS endpoint is accessible
   */
  async testConnection(): Promise<boolean> {
    try {
      const testUrl = this.buildAuthorizedWFSURL("p2d2_containers", {
        maxFeatures: "1",
      });
      const response = await this.fetchWithAuth(testUrl, { method: "HEAD" });
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

// Export singleton instance - sollte explizit mit Konfiguration erstellt werden
export const wfsAuthClient = new WFSAuthClient();
