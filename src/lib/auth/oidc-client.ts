// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
import {
  discovery,
  ClientSecretBasic,
  type Configuration,
} from "openid-client";
import {
  ZITADEL_ISSUER,
  ZITADEL_CLIENT_ID,
  ZITADEL_CLIENT_SECRET,
} from "astro:env/server";

let cachedConfig: Configuration | null = null;
let discoveryPromise: Promise<Configuration> | null = null;

/**
 * Liefert eine konfigurierte OIDC-Configuration via Zitadel Discovery-Endpoint.
 *
 * In openid-client v6 gibt `discovery()` ein `Configuration`-Objekt zurück,
 * das ServerMetadata und ClientMetadata bündelt. Dieses Objekt bietet Methoden
 * für alle OAuth2/OIDC-Flows:
 *   - buildAuthorizationUrl()
 *   - authorizationCodeGrant()
 *   - refreshTokenGrant()
 *   - validateIdToken()
 *   - PushedAuthorizationRequest, etc.
 *
 * Implementiert als Singleton mit Lazy Initialization und Promise-Dedup,
 * sodass der Discovery-Endpoint nur einmal pro Prozess angefragt wird.
 */
export async function getOidcConfig(): Promise<Configuration> {
  if (cachedConfig) {
    return cachedConfig;
  }

  if (!discoveryPromise) {
    discoveryPromise = (async () => {
      const issuerUrl = new URL(
        "/.well-known/openid-configuration",
        ZITADEL_ISSUER,
      );

      const config = await discovery(
        issuerUrl,
        ZITADEL_CLIENT_ID,
        undefined,
        ClientSecretBasic(ZITADEL_CLIENT_SECRET),
      );

      cachedConfig = config;
      return cachedConfig;
    })();
  }

  return discoveryPromise;
}
