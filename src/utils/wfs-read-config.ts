/**
 * WFS Read Configuration Helper
 *
 * Derives the stage-specific WFS read endpoint from public environment variables.
 *
 * Read access is anonymous - no credentials required.
 *
 * Endpoint derivation:
 *   PUBLIC_WFST_ENDPOINT=https://wfs.data-dna.eu/geoserver/ows
 *   PUBLIC_WFST_WORKSPACE=Verwaltungsdaten_de1
 *   => https://wfs.data-dna.eu/geoserver/Verwaltungsdaten_de1/ows
 *
 * Local dev proxy (/api/wfs-proxy) is used only for CORS bypass during development.
 * Production/Staging use direct anonymous access.
 */

export interface WFSReadConfig {
  endpoint: string;
  workspace: string;
  namespace: string;
}

/**
 * Creates a WFS read configuration from environment variables.
 *
 * @param overrides - Optional overrides for testing or special cases
 * @returns WFSReadConfig with workspace-specific endpoint
 * @throws Error if required environment variables are missing or malformed
 */
export function createWFSReadConfig(
  overrides: Partial<WFSReadConfig> = {},
): WFSReadConfig {
  const baseEndpoint =
    overrides.endpoint ??
    import.meta.env.PUBLIC_WFST_ENDPOINT ??
    import.meta.env.PUBLICWFSTENDPOINT;
  const workspace =
    overrides.workspace ??
    import.meta.env.PUBLIC_WFST_WORKSPACE ??
    import.meta.env.PUBLICWFSTWORKSPACE;
  const namespace =
    overrides.namespace ??
    import.meta.env.WFST_NAMESPACE ??
    import.meta.env.WFSTNAMESPACE ??
    "urn:data-dna:govdata";

  if (!baseEndpoint) {
    throw new Error(
      "[WFS] PUBLIC_WFST_ENDPOINT or PUBLICWFSTENDPOINT is missing",
    );
  }

  if (!workspace) {
    throw new Error(
      "[WFS] PUBLIC_WFST_WORKSPACE or PUBLICWFSTWORKSPACE is missing",
    );
  }

  if (!baseEndpoint.endsWith("/geoserver/ows")) {
    throw new Error(
      `[WFS] Unsupported PUBLIC_WFST_ENDPOINT format: ${baseEndpoint}. Expected format: https://.../geoserver/ows`,
    );
  }

  // Derive workspace-specific endpoint:
  // https://wfs.data-dna.eu/geoserver/ows => https://wfs.data-dna.eu/geoserver/<workspace>/ows
  const endpoint = baseEndpoint.replace(
    "/geoserver/ows",
    `/geoserver/${workspace}/ows`,
  );

  return {
    endpoint,
    workspace,
    namespace,
  };
}

/**
 * Gets the workspace-specific read endpoint directly.
 * Convenience function for quick endpoint access.
 *
 * @returns The workspace-specific WFS read endpoint URL
 */
export function getWFSReadEndpoint(): string {
  return createWFSReadConfig().endpoint;
}
