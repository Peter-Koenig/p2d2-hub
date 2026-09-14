// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: WFS-Konfiguration — Astro-Adapter auf @p2d2/core.
//
// Liest die `import.meta.env`-Variablen (Vite/Astro-Kopplung) und delegiert
// die reine Endpoint-Ableitung an @p2d2/core.
import { deriveWorkspaceEndpoint } from "@p2d2/core/wfst/wfs-url";
import type { WFSReadConfig } from "@p2d2/core/wfst/wfs-url";

export type { WFSReadConfig } from "@p2d2/core/wfst/wfs-url";

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

  const endpoint = deriveWorkspaceEndpoint(baseEndpoint, workspace);

  return {
    endpoint,
    workspace,
    namespace,
  };
}

export function getWFSReadEndpoint(): string {
  return createWFSReadConfig().endpoint;
}
