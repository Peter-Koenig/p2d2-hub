// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: API-Endpunkt für manuelle OSM-Polygon-Synchronisation
//
// Stage-spezifische WFS-T-Credentials werden aus der aufgerufenen URL
// abgeleitet (resolveStageFromUrl()) und per import.meta.env dynamisch
// geladen – identisch zum Vorgehen in POST /api/workflow/session.
import { syncKommunePolygons } from "../../utils/polygon-wfst-sync";
import { WFST_WORKSPACE, WFST_NAMESPACE } from "astro:env/server";
import { resolveStageFromUrl } from "../../lib/workflow/utils";

export async function POST({ request }: { request: Request }) {
  try {
    const { slug, categories } = await request.json();

    if (!slug) {
      return new Response(
        JSON.stringify({ error: "slug parameter required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Stage aus der aufgerufenen URL ableiten
    const hostname = new URL(request.url).hostname;
    const stage = resolveStageFromUrl(hostname).stage;
    const stageKey = stage.toUpperCase();

    const endpoint = import.meta.env[`WFST_ENDPOINT_${stageKey}`] as
      | string
      | undefined;
    const username = import.meta.env[`WFST_USER_${stageKey}`] as
      | string
      | undefined;
    const password = import.meta.env[`WFST_PW_${stageKey}`] as
      | string
      | undefined;

    if (!endpoint || !username || !password) {
      return new Response(
        JSON.stringify({
          error: "CONFIG_ERROR",
          message: `Stage '${stage}' hat keine WFS-T-Konfiguration`,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const wfstConfig = {
      endpoint,
      workspace: WFST_WORKSPACE,
      namespace: WFST_NAMESPACE,
      username,
      password,
    };

    const result = await syncKommunePolygons(
      slug,
      categories || ["admin_boundary"],
      wfstConfig,
    );

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
