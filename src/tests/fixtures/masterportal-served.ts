// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Testhilfe — Portal-Dateien so lesen, wie das nginx des Portals sie ausliefert
//
// Die Dateien in supplement/masterportal/portal/resources/ tragen statt eines
// Hosts die Platzhalter MAPSERVER-URL und GEOSERVER_URL. Das nginx des Portals
// ersetzt sie beim Ausliefern per sub_filter durch ${PORTAL_BACKEND_ORIGIN}/mapserver
// bzw. ${PORTAL_BACKEND_ORIGIN}/geoserver (05-masterportal-env.envsh im Installer).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const RESOURCES = resolve(__dirname, "../../../supplement/masterportal/portal/resources");

/** Origin der Stage de1 auf der Domain der früheren festen URLs (Vertragstests). */
export const DE1_ORIGIN = "https://geoportal.udp.data-dna.eu";

/** Ersetzt die Platzhalter wie das nginx des Portals. */
export function substitute(text: string, origin = DE1_ORIGIN): string {
  return text.replaceAll("GEOSERVER_URL", `${origin}/geoserver`).replaceAll("MAPSERVER-URL", `${origin}/mapserver`);
}

/** JSON-Datei aus resources/ nach der Ersetzung. */
export function servedJson(name: string, origin = DE1_ORIGIN): any {
  return JSON.parse(substitute(readFileSync(resolve(RESOURCES, name), "utf8"), origin));
}
