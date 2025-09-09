/**
 * Test Utility für WFS-Auth-Client
 * Überprüft URL-Generierung und Credential-Handling
 */

import { WFSAuthClient, type WFSConfig } from "./wfs-auth";

// Test für URL-Generierung
function testWFSURLGeneration(): void {
  console.log("=== Testing WFS URL Generation ===");

  // Client mit expliziter Konfiguration erstellen (umgeht import.meta.env)
  const client = new WFSAuthClient({
    endpoint: "https://wfs.data-dna.eu/geoserver/ows",
    workspace: "Verwaltungsdaten",
    namespace: "urn:data-dna:govdata",
    credentials: {
      username: "p2d2_wfs_user",
      password: "eif1nu4ao9Loh0oobeev",
    },
  });

  // Test 1: Basic URL ohne Parameter
  const basicUrl = client.buildAuthorizedWFSURL("p2d2_containers");
  console.log("Basic URL:", basicUrl);

  // Test 2: URL mit BBOX
  const bboxUrl = client.buildAuthorizedWFSURL("p2d2_containers", {
    bbox: "6.9,50.9,7.0,51.0,EPSG:4326",
    maxFeatures: "10",
  });
  console.log("BBOX URL:", bboxUrl);

  // Test 3: URL mit CQL Filter
  const cqlUrl = client.buildAuthorizedWFSURL("p2d2_containers", {
    CQL_FILTER: "category='friedhoefe'",
  });
  console.log("CQL URL:", cqlUrl);

  console.log("=== URL Generation Test Complete ===\n");
}

// Test für Credential-Validierung
function testCredentialValidation(): void {
  console.log("=== Testing Credential Validation ===");

  const client = new WFSAuthClient({
    endpoint: "https://wfs.data-dna.eu/geoserver/ows",
    workspace: "Verwaltungsdaten",
    namespace: "urn:data-dna:govdata",
    credentials: {
      username: "p2d2_wfs_user",
      password: "eif1nu4ao9Loh0oobeev",
    },
  });

  // Für Testzwecke direkt auf die config Eigenschaft zugreifen
  const config = (client as any).config;

  console.log("Endpoint:", config.endpoint);
  console.log("Workspace:", config.workspace);
  console.log("Username:", config.credentials.username);
  console.log("Password:", config.credentials.password);
  console.log("Password length:", config.credentials.password.length);

  // Test ob Credentials gesetzt sind
  const hasCredentials =
    config.credentials.username && config.credentials.password;
  console.log("Credentials present:", hasCredentials);

  // Test ob Platzhalter verwendet werden
  const usingPlaceholders =
    config.credentials.username === "readonly_user" ||
    config.credentials.password === "readonly_password";
  console.log("Using placeholders:", usingPlaceholders);

  // Test ob echte Credentials verwendet werden
  const usingRealCredentials =
    config.credentials.username === "p2d2_wfs_user" &&
    config.credentials.password === "eif1nu4ao9Loh0oobeev";
  console.log("Using real credentials:", usingRealCredentials);

  console.log("=== Credential Validation Complete ===\n");
}

// Test für Header-Generierung
function testHeaderGeneration(): void {
  console.log("=== Testing Header Generation ===");

  const client = new WFSAuthClient({
    endpoint: "https://wfs.data-dna.eu/geoserver/ows",
    workspace: "Verwaltungsdaten",
    namespace: "urn:data-dna:govdata",
    credentials: {
      username: "p2d2_wfs_user",
      password: "eif1nu4ao9Loh0oobeev",
    },
  });

  // Test Headers ohne bestehende Headers
  const headers1 = (client as any).buildHeaders();
  console.log("Empty headers:", Object.fromEntries(headers1.entries()));

  // Test Headers mit bestehenden Headers
  const existingHeaders = new Headers({ "Content-Type": "application/json" });
  const headers2 = (client as any).buildHeaders(existingHeaders);
  console.log("Headers with existing:", Object.fromEntries(headers2.entries()));

  // Test ob Authorization header vorhanden ist
  const hasAuth = headers2.has("Authorization");
  console.log("Authorization header present:", hasAuth);

  if (hasAuth) {
    const authHeader = headers2.get("Authorization");
    console.log("Authorization header value:", authHeader);
    console.log(
      "Authorization type:",
      authHeader?.startsWith("Basic ") ? "Basic Auth" : "Unknown",
    );

    // Überprüfe ob Base64 korrekt ist
    if (authHeader?.startsWith("Basic ")) {
      const base64Value = authHeader.substring(6);
      try {
        const decoded = Buffer.from(base64Value, "base64").toString("utf8");
        console.log("Decoded credentials:", decoded);
        console.log(
          "Expected credentials:",
          "p2d2_wfs_user:eif1nu4ao9Loh0oobeev",
        );
        console.log(
          "Credentials match:",
          decoded === "p2d2_wfs_user:eif1nu4ao9Loh0oobeev",
        );
      } catch (e) {
        console.log("Failed to decode base64:", e);
      }
    }
  }

  console.log("=== Header Generation Complete ===\n");
}

// Haupttest-Funktion
async function runTests(): Promise<void> {
  try {
    console.log("🚀 Starting WFS Auth Client Tests\n");

    testWFSURLGeneration();
    testCredentialValidation();
    testHeaderGeneration();

    console.log("✅ All tests completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

// Test direkt ausführen
runTests();

// Export für Verwendung in anderen Tests
export {
  testWFSURLGeneration,
  testCredentialValidation,
  testHeaderGeneration,
  runTests,
};
