// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Unit-Test — getOidcConfig() fragt die Realm-Discovery-URL an.
//
// Offline: fetch wird global gemockt; astro:env/server wird per vi.mock mit
// Dummy-Werten ersetzt. Kein Netzwerkzugriff, keine echten Zugangsdaten,
// kein .env.test mit Secrets.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ISSUER = "https://idp.example/realms/test";

// astro:env/server ist ein Astro-virtuelles Modul und wird hier ersetzt.
// Werte bewusst hartkodiert (kein Bezug auf äußere Variablen), weil die
// vi.mock-Factory von Vitest gehoistet wird.
vi.mock("astro:env/server", () => ({
  OIDC_ISSUER: "https://idp.example/realms/test",
  OIDC_CLIENT_ID: "test-client-id",
  OIDC_CLIENT_SECRET: "test-client-secret",
}));

describe("getOidcConfig — Discovery-URL", () => {
  const requested: string[] = [];

  beforeEach(() => {
    // Modul-Cache (cachedConfig/discoveryPromise) zurücksetzen, damit jeder
    // Test eine frische Modulinstanz importiert und der Cache nicht nachwirkt.
    vi.resetModules();
    requested.length = 0;

    vi.stubGlobal(
      "fetch",
      async (input: string | URL | Request) => {
        requested.push(String(input instanceof Request ? input.url : input));
        return new Response(
          JSON.stringify({
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
            token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
            jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fragt genau die Realm-Discovery-URL an (Issuer-Pfad bleibt erhalten)", async () => {
    const { getOidcConfig } = await import("../lib/auth/oidc-client");
    await getOidcConfig();

    expect(requested).toHaveLength(1);
    expect(requested[0]).toBe(
      "https://idp.example/realms/test/.well-known/openid-configuration",
    );
    expect(requested[0].startsWith("https://idp.example/.well-known/")).toBe(
      false,
    );
    expect(requested[0].split(".well-known").length - 1).toBe(1);
  });
});
