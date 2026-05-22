// SPDX-FileCopyrightText: 2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2

/**
 * Ermittelt den korrekten Origin für OIDC-Redirects.
 * Nutzt PUBLIC_SITE_URL aus .env als Single Source of Truth,
 * da OPNSense Caddy die X-Forwarded-*-Header nicht zuverlässig setzt.
 */
export function getOrigin(): string {
  // Umgebungsvariable hat Vorrang (explizit konfiguriert pro Stage)
  const envOrigin = import.meta.env.PUBLIC_SITE_URL;
  
  if (envOrigin) {
    return envOrigin.replace(/\/$/, ''); // Trailing Slash entfernen
  }
  

  console.log("[OIDC-ORIGIN] import.meta.env.DEV =", import.meta.env.DEV);
  console.log("[OIDC-ORIGIN] import.meta.env.MODE =", import.meta.env.MODE);
  console.log("[OIDC-ORIGIN] PUBLIC_SITE_URL =", envOrigin);

  // Fallback für lokale Entwicklung ohne .env
  if (import.meta.env.DEV) {
    return 'http://localhost:4321';
  }
  
  // Sollte nie erreicht werden
  throw new Error('PUBLIC_SITE_URL ist nicht konfiguriert in .env');
}
