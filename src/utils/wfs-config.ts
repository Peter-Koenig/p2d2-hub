// src/utils/wfs-config.ts
/**
 * Server-side WFS Configuration
 * Lädt Credentials sicher serverseitig
 */

export function getWFSConfig() {
  return {
    endpoint: process.env.WFST_ENDPOINT || import.meta.env.WFST_ENDPOINT,
    workspace:
      process.env.WFST_WORKSPACE ||
      import.meta.env.WFST_WORKSPACE ||
      "Verwaltungsdaten",
    namespace:
      process.env.WFST_NAMESPACE ||
      import.meta.env.WFST_NAMESPACE ||
      "urn:data-dna:govdata",
    credentials: {
      username:
        process.env.WFST_USERNAME || import.meta.env.WFST_USERNAME || "",
      password:
        process.env.WFST_PASSWORD || import.meta.env.WFST_PASSWORD || "",
    },
  };
}
