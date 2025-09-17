// src/utils/wfs-config.ts
/**
 * Server-side WFS Configuration
 * Lädt Credentials sicher über import.meta.env (Build-time injection)
 */

export function getWFSConfig() {
  return {
    endpoint: import.meta.env.WFST_ENDPOINT,
    workspace: import.meta.env.WFST_WORKSPACE || "Verwaltungsdaten",
    namespace: import.meta.env.WFST_NAMESPACE || "urn:data-dna:govdata",
    credentials: {
      username: import.meta.env.WFST_USERNAME || "",
      password: import.meta.env.WFST_PASSWORD || "",
    },
  };
}
