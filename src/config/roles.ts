// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Zentrales Rechte-Modul – Permission-to-Role-Mapping
//
// Jede geschützte Aktion (permission) ist einem Set von Rollen zugeordnet,
// die sie ausführen dürfen. Die Funktion hasPermission() prüft, ob der
// Benutzer mindestens eine der benötigten Rollen besitzt.
//
// Erweiterung: Für neue Aktionen einfach einen Eintrag in PERMISSIONS
// hinzufügen – kein weiterer Code nötig.

/**
 * Mapping von Permission-Keys auf erlaubte Rollen.
 *
 * Eine Permission ist gewährt, wenn der Benutzer mindestens eine der
 * angegebenen Rollen in seinem `roles`-Array hat.
 *
 * @example
 *   hasPermission(['editor', 'verwaltung'], 'openSession') → true
 *   hasPermission(['editor'], 'openSession')              → false
 */
export const PERMISSIONS: Record<string, string[]> = {
  /** Session öffnen (POST /api/workflow/session) */
  openSession: ["verwaltung"],

  /** Session schliessen (PATCH /api/workflow/session/:id) */
  closeSession: ["verwaltung"],
};

/**
 * Prüft, ob ein Benutzer für eine bestimmte Aktion berechtigt ist.
 *
 * @param userRoles  – Rollen-Array des Benutzers (z. B. ['editor', 'verwaltung'])
 * @param permission – Name der Aktion (z. B. 'openSession', 'closeSession')
 * @returns `true` wenn mindestens eine benötigte Rolle vorhanden ist
 */
export function hasPermission(
  userRoles: string[],
  permission: string,
): boolean {
  const requiredRoles = PERMISSIONS[permission];
  if (!requiredRoles || requiredRoles.length === 0) return false;
  return requiredRoles.some((role) => userRoles.includes(role));
}
