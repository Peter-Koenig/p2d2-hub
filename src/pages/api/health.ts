// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Health-Endpoint für Kubernetes-Liveness-/Readiness-Probes.
// Bewusst abhängigkeitsfrei (keine DB-/GeoServer-/WFS-Abfrage): signalisiert
// nur, dass der Node-Prozess lebt und HTTP beantwortet.
import type { APIRoute } from "astro";
import pkg from "../../../package.json";

export const GET: APIRoute = () => {
  // Nur bei HEALTH_VERBOSE=true zur Laufzeit Zusatzinfo liefern (kein
  // Fingerprinting im Standard-Betrieb). Keine DB-/WFS-/SHA-Daten.
  const verbose = process.env.HEALTH_VERBOSE === "true";
  const body = verbose
    ? { status: "ok", node: process.version, version: pkg.version }
    : { status: "ok" };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
