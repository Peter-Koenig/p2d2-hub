// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: WFS-Auth-Client — Umgebungs-Adapter auf @p2d2/core.
//
// Die reine URL-/Request-Bau-Logik liegt in @p2d2/core; hier bleiben die
// Umgebungserkennung (window/process), die Proxy-Auflösung (/api/wfs-proxy)
// und der Singleton.
import { createWFSReadConfig } from "./wfs-read-config";
import {
  buildWFSURL as buildWFSURLCore,
  buildBBoxWFSURL as buildBBoxWFSURLCore,
  buildBasicAuthHeader,
} from "@p2d2/core";
import type { WFSCredentials, WFSConfig } from "@p2d2/core";

export type { WFSCredentials, WFSConfig } from "@p2d2/core";

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

export class WFSAuthClient {
  private config: WFSConfig;

  constructor(config: Partial<WFSConfig> = {}) {
    const envInfo = detectEnvironment();
    const isDev = envInfo.isDev;

    let readConfig: WFSConfig;
    try {
      readConfig = createWFSReadConfig({
        endpoint: config.endpoint,
        workspace: config.workspace,
        namespace: config.namespace,
      });
    } catch (error) {
      if (process.env.NODE_ENV === "test") {
        readConfig = {
          endpoint: config.endpoint ?? "https://wfs.data-dna.eu/geoserver/ows",
          workspace: config.workspace ?? "Verwaltungsdaten",
          namespace: config.namespace ?? "urn:data-dna:govdata",
        };
      } else {
        throw error;
      }
    }

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

    if (!this.config.endpoint) {
      throw new Error("[WFS] Endpoint configuration missing");
    }
  }

  async validateWorkspace(): Promise<boolean> {
    try {
      const capabilitiesUrl = `${this.config.endpoint.replace("/ows", "/wfs")}?service=WFS&version=2.0.0&request=GetCapabilities`;
      const response = await fetch(capabilitiesUrl);
      const text = await response.text();

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

  buildWFSURL(typeName: string, params: Record<string, string> = {}): string {
    return buildWFSURLCore(this.config, typeName, params);
  }

  buildBBoxWFSURL(
    typeName: string,
    bbox: number[],
    crs: string = "EPSG:4326",
  ): string {
    return buildBBoxWFSURLCore(this.config, typeName, bbox, crs);
  }

  private resolveReadURL(url: string): string {
    const proxyUrl = `/api/wfs-proxy?url=${encodeURIComponent(url)}`;
    console.log(`[WFS] Using WFS proxy for read access`, proxyUrl);
    return proxyUrl;
  }

  private buildHeaders(existingHeaders?: HeadersInit): Headers {
    const headers = new Headers(existingHeaders);

    if (
      this.config.credentials?.username?.trim() &&
      this.config.credentials?.password?.trim()
    ) {
      headers.set(
        "Authorization",
        buildBasicAuthHeader(this.config.credentials),
      );
    }

    return headers;
  }

  async fetchWFS(url: string, options: RequestInit = {}): Promise<Response> {
    try {
      const requestUrl = this.resolveReadURL(url);

      const response = await fetch(requestUrl, {
        ...options,
        headers: new Headers(options.headers),
      });

      if (!response.ok) {
        const text = await response.text();
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

  async getFeatures(
    typeName: string,
    params: Record<string, string> = {},
  ): Promise<any> {
    const url = this.buildWFSURL(typeName, params);
    const response = await this.fetchWFS(url);
    return response.json();
  }

  async getFeaturesInBBox(
    typeName: string,
    bbox: number[],
    crs: string = "EPSG:4326",
  ): Promise<any> {
    const url = this.buildBBoxWFSURL(typeName, bbox, crs);
    const response = await this.fetchWFS(url);
    return response.json();
  }

  async executeWFSTransaction(transactionXml: string): Promise<Response> {
    const headers = new Headers({
      "Content-Type": "application/xml",
    });

    if (
      this.config.credentials?.username &&
      this.config.credentials?.password
    ) {
      headers.set(
        "Authorization",
        buildBasicAuthHeader(this.config.credentials),
      );
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

  async testConnection(): Promise<boolean> {
    try {
      const testUrl = this.buildWFSURL("geo-containers", {
        maxFeatures: "1",
      });
      const response = await this.fetchWFS(testUrl);
      return response.ok;
    } catch (error) {
      console.warn("WFS connection test failed:", error);
      return false;
    }
  }

  getConfig(): Readonly<WFSConfig> {
    return { ...this.config };
  }

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
