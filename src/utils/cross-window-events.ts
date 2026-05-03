// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
/**
 * Cross-Window Event Bridge für p2d2
 *
 * Ermöglicht Event-Kommunikation zwischen Hauptfenster und Editor-Fenster.
 * Nutzt window.opener für Child->Parent und window.postMessage für bidirektionale Kommunikation.
 */

import { P2D2EventType, type P2D2EventMap, logToEventConsole } from "./events";

// Eindeutige Window-ID für jedes Fenster
const WINDOW_ID = `p2d2-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Dispatcht ein Event sowohl lokal als auch an verbundene Fenster (Hauptfenster/Editor).
 *
 * @param eventType - Typsicherer Event-Typ aus P2D2EventType
 * @param detail - Payload passend zum Event-Typ
 * @param options - Optional: crossWindow (default: true)
 */
export function dispatchCrossWindowEvent<T extends P2D2EventType>(
  eventType: T,
  detail: P2D2EventMap[T],
  options: { crossWindow?: boolean } = { crossWindow: true },
): void {
  // 1. Lokal dispatchen
  const localEvent = new CustomEvent(eventType, { detail });
  window.dispatchEvent(localEvent);

  // Log im lokalen EventConsole
  logToEventConsole(eventType, detail, {
    source: getWindowType(),
    windowId: WINDOW_ID,
  });

  // 2. Cross-Window dispatch (falls aktiviert)
  if (!options.crossWindow) return;

  try {
    // FALL A: Wir sind ein Editor-Fenster → Sende an Hauptfenster (opener)
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        {
          type: "p2d2:cross-window-event",
          eventType,
          detail,
          source: "editor",
          windowId: WINDOW_ID,
          timestamp: Date.now(),
        },
        window.location.origin, // Same-origin policy
      );

      console.debug(`[cross-window] Sent ${eventType} to main window`, detail);
    }

    // FALL B: Wir sind das Hauptfenster → Sende an alle Editor-Fenster
    // (Registrierung von Editor-Fenstern siehe unten)
    if (isMainWindow()) {
      broadcastToEditorWindows(eventType, detail);
    }
  } catch (error) {
    console.warn(
      "[cross-window] Failed to dispatch cross-window event:",
      error,
    );
  }
}

/**
 * Empfängt Events aus anderen Fenstern und dispatcht sie lokal.
 * MUSS in jedem Fenster (Haupt + Editor) aufgerufen werden!
 */
export function initializeCrossWindowBridge(): void {
  if (typeof window === "undefined") {
    console.warn("[cross-window] Skipping initialization (not in browser)");
    return;
  }

  window.addEventListener("message", (event) => {
    // Security: Nur eigene Origin akzeptieren
    if (event.origin !== window.location.origin) return;

    const message = event.data;

    // Nur p2d2 Cross-Window Events verarbeiten
    if (message.type !== "p2d2:cross-window-event") return;

    const { eventType, detail, source, windowId, timestamp } = message;

    console.debug(
      `[cross-window] Received ${eventType} from ${source} (${windowId})`,
      detail,
    );

    // Lokal dispatchen
    const localEvent = new CustomEvent(eventType, { detail });
    window.dispatchEvent(localEvent);

    // Log im EventConsole mit Markierung
    logToEventConsole(eventType, detail, {
      source,
      windowId,
      crossWindow: true,
      timestamp,
    });
  });

  console.info("[cross-window] Bridge initialized for", getWindowType());
}

/**
 * Registriert ein neu geöffnetes Editor-Fenster (nur im Hauptfenster aufrufen).
 */
const editorWindows = new Set<Window>();

export function registerEditorWindow(editorWindow: Window): void {
  editorWindows.add(editorWindow);

  // Cleanup bei Fenster-Schließung
  const checkClosed = setInterval(() => {
    if (editorWindow.closed) {
      editorWindows.delete(editorWindow);
      clearInterval(checkClosed);
      console.debug("[cross-window] Editor window closed, unregistered");
    }
  }, 1000);
}

/**
 * Sendet ein Event an alle registrierten Editor-Fenster.
 */
function broadcastToEditorWindows(eventType: string, detail: any): void {
  editorWindows.forEach((editorWindow) => {
    if (!editorWindow.closed) {
      editorWindow.postMessage(
        {
          type: "p2d2:cross-window-event",
          eventType,
          detail,
          source: "main",
          windowId: WINDOW_ID,
          timestamp: Date.now(),
        },
        window.location.origin,
      );
    }
  });
}

/**
 * Hilfsfunktionen zur Fenster-Identifikation.
 */
function isMainWindow(): boolean {
  return !window.opener;
}

function getWindowType(): "main" | "editor" {
  return isMainWindow() ? "main" : "editor";
}

export function getWindowId(): string {
  return WINDOW_ID;
}
