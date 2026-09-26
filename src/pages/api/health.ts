// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Health-Endpoint für Kubernetes-Liveness-/Readiness-Probes.
// Bewusst abhängigkeitsfrei (keine DB-/GeoServer-/WFS-Abfrage): signalisiert
// nur, dass der Node-Prozess lebt und HTTP beantwortet.
import type { APIRoute } from "astro";

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
