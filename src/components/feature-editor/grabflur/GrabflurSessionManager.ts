// SPDX-FileCopyrightText: 2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2 GrabflurSessionManager: Session-State-Maschine für den Grabflur-Editor
//
// Vollständiger Session-Lifecycle mit UI-Dialogen (alert, confirm).
// Ersetzt den früheren WorkflowSessionManager.
//
// API-Sequenz (vereinfacht):
//   openSession()  → POST /api/workflow/session        → state='editing'
//   commitAndClose() → POST /api/workflow/session/:id/commit → state='completed'
//   abortSession() → PATCH /api/workflow/session/:id (ohne version_id) → state='idle'

/**
 * Session-Phasen.
 *
 * idle ──openSession()──→ opening ──201──→ editing
 * editing ──commitAndClose()──→ saving ──200──→ completed ──→ idle
 * editing ──abortSession()──→ completed ──→ idle
 * opening ──409──→ conflict ──→ idle
 * opening/saving ──Fehler──→ error ──→ idle
 */
export type SessionState =
  | "idle"
  | "opening"
  | "editing"
  | "saving"
  | "completed"
  | "conflict"
  | "error";

// ---------------------------------------------------------------------------
// Fehlerklassen
// ---------------------------------------------------------------------------

/**
 * HTTP 409 – Das Feature wird bereits von einem anderen Nutzer bearbeitet.
 */
export class SessionConflictError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SessionConflictError";
  }
}

/**
 * Sonstige Fehler beim Session-Start (Netzwerk, 4xx ohne 409, 5xx).
 */
export class SessionOpenError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SessionOpenError";
  }
}

/**
 * WFS-T-Insert nach 3 Versuchen endgültig fehlgeschlagen.
 * Enthält die Session-ID fürs Debugging/Recovery.
 */
export class RecoveryRequiredError extends Error {
  readonly sessionId: number;

  constructor(sessionId: number, msg: string) {
    super(msg);
    this.name = "RecoveryRequiredError";
    this.sessionId = sessionId;
  }
}

// ---------------------------------------------------------------------------
// GrabflurSessionManager
// ---------------------------------------------------------------------------

/**
 * Kapselt den Session-Lifecycle für den Grabflur-Editor.
 *
 * State-Maschine mit UI-Dialogen. Die Klasse kommuniziert per fetch mit
 * den API-Endpunkten und zeigt bei Fehlern Browser-Dialoge (alert, confirm).
 *
 * @example
 * ```typescript
 * const sessionMgr = new GrabflurSessionManager();
 * await sessionMgr.openSession("33", "Melaten", "WP-01", municipality);
 * // ... bearbeiten ...
 * await sessionMgr.commitAndClose([{ uuid, geometry }], projection);
 * ```
 */
export default class GrabflurSessionManager {
  private state: SessionState = "idle";
  private sessionId: number | null = null;

  // -----------------------------------------------------------------------
  // Öffentliche API
  // -----------------------------------------------------------------------

  /** Gibt den aktuellen Session-State zurück. */
  getState(): SessionState {
    return this.state;
  }

  /** Gibt die aktuelle Session-ID zurück (null wenn idle/completed/error). */
  getSessionId(): number | null {
    return this.sessionId;
  }

  /**
   * true, wenn eine Session aktiv ist und der Editor Klicks blockieren soll
   * (Zustände: editing | saving | closing).
   */
  isSessionActive(): boolean {
    return this.state === "editing" || this.state === "saving";
  }

  /**
   * Öffnet eine Session für einen Friedhof (2. Klick auf eine Grabflur).
   *
   * Ruft POST /api/workflow/session auf. Die Session wird für den
   * gesamten Friedhof geöffnet (Container-Version), nicht für eine
   * einzelne Grabflur.
   *
   * @param fhNr         Friedhofsnummer (z. B. "33")
   * @param fhName       Friedhofsname (z. B. "Melaten")
   * @param wpName       Wahlurnenbezirk (z. B. "WP-01")
   * @param municipality Kommune-Kürzel (z. B. "koeln")
   * @param featureUuid  UUID der angeklickten Grabflur (p2d2_uuid)
   *
   * @throws {SessionConflictError} bei HTTP 409 (bereits in Bearbeitung)
   * @throws {SessionOpenError}     bei Netzwerkfehlern oder anderen HTTP-Status
   */
  async openSession(
    fhNr: string,
    fhName: string,
    wpName: string,
    municipality: string,
    featureUuid: string,
  ): Promise<void> {
    this.state = "opening";

    const body = {
      feature_type: "grabflur",
      feature_uuid: featureUuid,
      feature_set_id: "fh_" + fhNr,
      context: {
        key: "fh_nr",
        label: fhName,
        value: fhNr,
      },
      wpname: wpName,
      municipality,
      edit_comment: "",
    };

    try {
      const resp = await fetch("/api/workflow/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (resp.status === 201) {
        const data: { session_id: number; workflow_status: string } =
          await resp.json();
        this.sessionId = data.session_id;
        this.state = "editing";
        return;
      }

      if (resp.status === 409) {
        this.state = "conflict";
        const name = fhName || "unbekannt";
        const nr = fhNr || "??";
        await resp.text().catch(() => ""); // drain body
        alert(
          `Leider wird der Friedhof '${name}(${nr})' aktuell schon bearbeitet. Bitte versuchen Sie es später nochmals.`,
        );
        throw new SessionConflictError(
          `Session-Konflikt für Friedhof '${name}(${nr})': bereits in Bearbeitung`,
        );
      }

      // Alle anderen Fehler (4xx, 5xx)
      this.state = "error";
      const text = await resp.text().catch(() => "");
      alert(`Session konnte nicht geöffnet werden (HTTP ${resp.status}).`);
      throw new SessionOpenError(
        `Session-Start fehlgeschlagen (HTTP ${resp.status}): ${text.slice(0, 500)}`,
      );
    } catch (err) {
      // Bereits geworfene Fehler durchreichen
      if (
        err instanceof SessionConflictError ||
        err instanceof SessionOpenError
      ) {
        throw err;
      }
      // Netzwerk-/Syntaxfehler
      this.state = "error";
      alert("Netzwerkfehler: Session konnte nicht geöffnet werden.");
      throw new SessionOpenError(
        `Netzwerkfehler beim Session-Start: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Bricht die aktive Session ab (Cancel-Button oder Fehler-Pfad).
   *
   * Sendet PATCH /api/workflow/session/:id ohne version_id an den Server
   * (Abbruch-Semantik). Fehler beim PATCH werden geloggt, die Session
   * gilt auf Client-Seite trotzdem als beendet.
   *
   * @param editcomment Optionaler Abbruch-Kommentar
   */
  async abortSession(editcomment?: string): Promise<void> {
    if (this.sessionId === null) {
      this.state = "idle";
      return;
    }

    const sid = this.sessionId;

    try {
      const resp = await fetch(`/api/workflow/session/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edit_comment: editcomment ?? "",
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        console.error(
          `[GrabflurSessionManager] Abbruch-PATCH fehlgeschlagen (HTTP ${resp.status}):`,
          text.slice(0, 300),
        );
      }
    } catch (err) {
      console.error(
        "[GrabflurSessionManager] Netzwerkfehler beim Session-Abbruch:",
        err,
      );
    }

    // Lokal immer aufräumen – auch wenn der PATCH fehlschlug
    this.reset();
  }

  /**
   * Speichert die modifizierten Geometrien UND schließt die Session.
   *
   * Ruft POST /api/workflow/session/:id/commit auf. Der API-Endpoint
   * führt intern WFS-T + Session-Close aus – KEIN nachfolgender
   * PATCH erforderlich (würde 422 produzieren).
   *
   * Retry-Logik bei WFS-T-Fehler:
   *   1. Versuch: initialer POST
   *   2. Versuch: sofort (ohne Wartezeit)
   *   3. Versuch: nach 2000 ms
   *   → Bei 422 SESSION_NOT_ACTIVE: sofortiger Abbruch
   *   → Nach 3 Fehlversuchen: RecoveryRequiredError
   *
   * @param modifiedFeatures Array von { uuid, geometry } der modifizierten Grabfluren
   * @param projection       Aktive Kartenprojektion (z. B. "EPSG:3857")
   * @param editcomment      Optionaler Bearbeitungskommentar
   *
   * @throws {SessionOpenError}      bei 422 (Session nicht mehr aktiv)
   * @throws {RecoveryRequiredError} nach 3 fehlgeschlagenen Commit-Versuchen
   */
  async commitAndClose(
    modifiedFeatures: Array<{ uuid: string; geometry: any }>,
    projection: string,
    editcomment?: string,
  ): Promise<void> {
    if (this.sessionId === null) {
      throw new SessionOpenError("Keine aktive Session – Commit nicht möglich");
    }
    if (this.state !== "editing") {
      throw new SessionOpenError(
        `Session ist nicht im Zustand 'editing' (aktuell: ${this.state})`,
      );
    }

    this.state = "saving";

    // --- Alle Geometrien nach EPSG:4326 konvertieren ---
    const GeoJSONFormat = (await import("ol/format/GeoJSON")).default;
    const geojsonFormat = new GeoJSONFormat();

    const features = modifiedFeatures.map((f) => {
      const geojsonStr = geojsonFormat.writeGeometry(f.geometry, {
        dataProjection: "EPSG:4326",
        featureProjection: projection,
      });
      return {
        feature_uuid: f.uuid,
        geometry: JSON.parse(geojsonStr),
      };
    });

    const comment = editcomment ?? "";
    const maxAttempts = 3; // Erstversuch + 2 Retries
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Vor Retry 2: 2 s warten
      if (attempt === 3) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      try {
        const resp = await fetch(
          `/api/workflow/session/${this.sessionId}/commit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              features,
              edit_comment: comment,
            }),
          },
        );

        // 422 – Session nicht mehr aktiv → sofort abbrechen, kein Retry
        if (resp.status === 422) {
          this.state = "error";
          const errBody = await resp.json().catch(() => ({}));
          alert(
            "Session ist nicht mehr aktiv – Änderungen konnten nicht gespeichert werden.",
          );
          throw new SessionOpenError(
            `Session ist nicht mehr aktiv: ${(errBody as any).message ?? "Unbekannter Fehler"}`,
          );
        }

        // Erfolg (200)
        if (resp.ok) {
          this.state = "completed";
          this.sessionId = null;
          this.reset();
          return; // ✅ Erfolgreich abgeschlossen
        }

        // 5xx oder andere Fehler → Retry
        const text = await resp.text().catch(() => "");
        lastError = new Error(
          `Commit fehlgeschlagen (HTTP ${resp.status}): ${text.slice(0, 500)}`,
        );
      } catch (err) {
        // Netzwerkfehler → Retry
        lastError =
          err instanceof Error
            ? err
            : new Error(`Netzwerkfehler: ${String(err)}`);
      }

      // Letzter Versuch fehlgeschlagen → RecoveryRequiredError
      if (attempt === maxAttempts) {
        this.state = "error";
        const sid = this.sessionId;
        throw new RecoveryRequiredError(
          sid!,
          `WFS-T-Insert nach ${maxAttempts} Versuchen endgültig fehlgeschlagen: ${lastError.message}`,
        );
      }
    }
  }

  // -----------------------------------------------------------------------
  // Intern
  // -----------------------------------------------------------------------

  /** Setzt den gesamten Session-State auf 'idle' zurück. */
  private reset(): void {
    this.state = "idle";
    this.sessionId = null;
  }
}
