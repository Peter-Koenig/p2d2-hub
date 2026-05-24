// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: API-Endpunkt für manuelle OSM-Polygon-Synchronisation
import { syncKommunePolygons } from "../../utils/polygon-wfst-sync";
import {
  WFST_ENDPOINT,
  WFST_WORKSPACE,
  WFST_NAMESPACE,
  WFST_USERNAME,
  WFST_PASSWORD,
} from "astro:env/server";

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

    const wfstConfig = {
      endpoint: WFST_ENDPOINT,
      workspace: WFST_WORKSPACE,
      namespace: WFST_NAMESPACE,
      username: WFST_USERNAME,
      password: WFST_PASSWORD,
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
