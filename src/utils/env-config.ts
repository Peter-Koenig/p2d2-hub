// Server-only environment configuration
// This file should only be used in Node.js/server contexts

let config: typeof import("dotenv").config;
let resolve: typeof import("path").resolve;

// Dynamische Imports um Browser-Kompatibilität zu gewährleisten
if (typeof process !== "undefined" && process.versions?.node) {
  config = (await import("dotenv")).config;
  resolve = (await import("path")).resolve;
}

export async function loadEnvironment() {
  if (typeof process === "undefined" || !process.versions?.node) {
    console.warn("[env-config] Not running in Node.js environment");
    return {
      nodeEnv: "browser",
      envFile: "",
      wfstEndpoint: undefined,
      wfstUsername: undefined,
      wfstPassword: undefined,
      wfstWorkspace: "Verwaltungsdaten",
    };
  }

  // Dynamische Imports für Node.js-Umgebung
  if (!config || !resolve) {
    config = (await import("dotenv")).config;
    resolve = (await import("path")).resolve;
  }
  const nodeEnv = process.env.NODE_ENV || "development";
  const envFile = `.env.${nodeEnv}`;

  // Load .env first (base config)
  config();

  // Load environment-specific file
  config({ path: resolve(process.cwd(), envFile) });

  console.log(`[env-config] Loaded environment: ${nodeEnv}`);
  console.log(`[env-config] Environment file: ${envFile}`);

  return {
    nodeEnv,
    envFile,
    wfstEndpoint: process.env.WFST_ENDPOINT,
    wfstUsername: process.env.WFST_USERNAME,
    wfstPassword: process.env.WFST_PASSWORD,
    wfstWorkspace: process.env.WFST_WORKSPACE || "Verwaltungsdaten",
  };
}
