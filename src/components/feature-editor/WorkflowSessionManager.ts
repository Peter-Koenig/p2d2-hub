// SPDX-FileCopyrightText: 2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2 Workflow-Session-Manager: Kapselt Session-Lifecycle für den Grabflur-Editor

import GeoJSON from "ol/format/GeoJSON";

/**
 * Lifecycle-Phasen einer Workflow-Session.
 *
 * ┌─────────┐  openSession() aktiv  ┌────────┐  commitAndClose()  ┌───────────┐
 * │  idle   │ ────────────────────→ │ active │ ─────────────────→ │ completed │
 * └─────────┘                       ├────────┤                    └───────────┘
 *                                   │ saving │ (commit läuft)
 *                                   ├────────┤
 *                                   │closing │ (finalisiert)
 *                                   ├────────┤         abortSession()
 *                                   │conflict│ ←──────────────── (keine Änderung)
 *                                   ├────────┤
 *                                   │ error  │ ← Fehler (nicht abgefangen)
 *                                   └────────┘
 */
type SessionPhase =
  | "idle"
  | "opening"
  | "active"
  | "saving"
  | "closing"
  | "completed"
  | "conflict"
  | "error";

// ---------------------------------------------------------------------------
// Fehlerklassen
// ---------------------------------------------------------------------------

/**
 * Wird geworfen, wenn POST /api/workflow/session einen 409 Conflict
 * zurückgibt – die Grabflur wird bereits von einem anderen Nutzer bearbeitet.
 */
export class SessionConflictError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SessionConflictError";
  }
}

/**
 * Wird geworfen, wenn POST /api/workflow/session aus anderen Gründen
 * fehlschlägt (Netzwerkfehler, 4xx/5xx ohne 409).
 */
export class SessionOpenError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "SessionOpenError";
  }
}

/**
 * Wird geworfen, wenn der WFS-T-Insert (Schritt 4) nach 3 Versuchen
 * endgültig fehlgeschlagen ist. Der Benutzer muss den Administrator
 * informieren – die Session-ID ist fürs Debugging relevant.
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
// WorkflowSessionManager
// ---------------------------------------------------------------------------

/**
 * Kapselt den vollständigen Session-Lifecycle für den Grabflur-Editor.
 *
 * Der Manager wird einmal pro Seiten-Load instanziiert und lebt im
 * `<script>`-Block von `grabflur-editor.astro`. Er hält den gesamten
 * Session-Zustand (Phase, sessionId, versionId, currentFeature) und
 * kommuniziert per `fetch` mit den API-Endpunkten.
 *
 * Die Klasse ist UI-frei: Sie zeigt keine `alert()`/`confirm()`-Dialoge
 * und verlässt sich nicht auf DOM-Elemente. Alle Rückmeldungen erfolgen
 * über Return-Werte und Error-Objekte.
 */
export default class WorkflowSessionManager {
  private phase: SessionPhase = "idle";
  private sessionId: number | null = null;
  private versionId: string | null = null;
  private currentFeature: any = null;

  // -----------------------------------------------------------------------
  // Öffentliche API
  // -----------------------------------------------------------------------

  /**
   * Öffnet eine Session für eine Grabflur (2. Klick).
   *
   * Ruft `POST /api/workflow/session` auf mit den Feature-Attributen
   * aus dem OpenLayers-Feature (`p2d2_uuid`, `fh_nr`, `fh_name`, `wp_name`).
   *
   * @param feature     OpenLayers-Feature der Grabflur
   * @param municipality Kommune-Kürzel (z. B. "koeln")
   *
   * @throws {SessionConflictError} bei HTTP 409 (bereits in Bearbeitung)
   * @throws {SessionOpenError}     bei Netzwerkfehlern oder anderen HTTP-Status
   */
  async openSession(feature: any, municipality: string): Promise<void> {
    this.phase = "opening";
    this.currentFeature = feature;

    const body = {
      feature_type: "grabflur",
      feature_uuid: feature.get("p2d2_uuid"),
      feature_set_id: "fh_" + feature.get("fh_nr"),
      context: {
        key: "fh_nr",
        label: feature.get("fh_name"),
        value: String(feature.get("fh_nr")),
      },
      wpname: feature.get("wp_name"),
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
        this.phase = "active";
        return;
      }

      if (resp.status === 409) {
        this.phase = "conflict";
        const text = await resp.text().catch(() => "");
        throw new SessionConflictError(
          text ||
            "Dieses Objekt wird bereits von einem anderen Nutzer bearbeitet.",
        );
      }

      // Alle anderen Fehler (4xx, 5xx)
      this.phase = "error";
      const text = await resp.text().catch(() => "");
      throw new SessionOpenError(
        `Session-Start fehlgeschlagen (HTTP ${resp.status}): ${text.slice(0, 500)}`,
      );
    } catch (err) {
      // Bereits geworfene Fehler – durchreichen
      if (
        err instanceof SessionConflictError ||
        err instanceof SessionOpenError
      ) {
        throw err;
      }
      // Netzwerk-/Syntaxfehler
      this.phase = "error";
      throw new SessionOpenError(
        `Netzwerkfehler beim Session-Start: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Schliesst die Session erfolgreich ab: sendet die modifizierte Geometrie
   * per WFS-T an den GeoServer und finalisiert die Session.
   *
   * Ablauf:
   *   1. Geometrie aus dem Feature in GeoJSON (EPSG:4326) konvertieren
   *   2. `POST /api/workflow/session/:id/commit` – führt WFS-T + Session-Close aus
   *   3. Bei WFS-T-Fehler: bis zu 2 Wiederholungen (sofort + nach 2 s)
   *   4. Bei endgültigem Fehler: `RecoveryRequiredError` mit sessionId
   *
   * @param feature     OpenLayers-Feature mit der aktuellen Geometrie
   * @param projection  Aktive Kartenprojektion (z. B. "EPSG:3857")
   * @param editcomment Optionaler Bearbeitungskommentar
   *
   * @throws {SessionOpenError}        bei 422 (Session nicht mehr aktiv)
   * @throws {RecoveryRequiredError}   nach 3 fehlgeschlagenen Commit-Versuchen
   */
  async commitAndClose(
    feature: any,
    projection: string,
    editcomment?: string,
  ): Promise<void> {
    if (this.sessionId === null) {
      throw new SessionOpenError("Keine aktive Session – Commit nicht möglich");
    }
    if (this.phase !== "active") {
      throw new SessionOpenError(
        `Session ist nicht im Zustand 'active' (aktuell: ${this.phase})`,
      );
    }

    this.phase = "saving";
    this.currentFeature = feature;

    // --- Geometrie konvertieren ---
    const geometry = feature.getGeometry();
    if (!geometry) {
      this.phase = "error";
      throw new SessionOpenError("Feature hat keine Geometrie");
    }

    const geojsonFormat = new GeoJSON();
    const geojsonStr = geojsonFormat.writeGeometry(geometry, {
      dataProjection: "EPSG:4326",
      featureProjection: projection,
    });
    const geojsonGeom = JSON.parse(geojsonStr);

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
              geometry: geojsonGeom,
              edit_comment: comment,
            }),
          },
        );

        // 422 – Session nicht mehr aktiv → sofort abbrechen, kein Retry
        if (resp.status === 422) {
          this.phase = "error";
          const errBody = await resp.json().catch(() => ({}));
          throw new SessionOpenError(
            `Session ist nicht mehr aktiv: ${(errBody as any).message ?? "Unbekannter Fehler"}`,
          );
        }

        // Erfolg (200)
        if (resp.ok) {
          const data: {
            session_id: number;
            version_id: string;
            snapshot_id: number;
            workflow_status: string;
          } = await resp.json();

          this.versionId = data.version_id;
          this.phase = "completed";
          this.sessionId = null;
          this.currentFeature = null;
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
        this.phase = "error";
        throw new RecoveryRequiredError(
          this.sessionId!,
          `WFS-T-Insert nach ${maxAttempts} Versuchen endgültig fehlgeschlagen: ${lastError.message}`,
        );
      }
    }
  }

  /**
   * Bricht die aktive Session ab (Cancel-Button oder Fehler-Pfad).
   *
   * Sendet `PATCH /api/workflow/session/:id` **ohne** `version_id` an den
   * Server – der Server setzt die Session auf 'aborted'.
   *
   * Fehler beim PATCH werden geloggt, aber nicht weitergereicht – die
   * Session gilt auf Client-Seite als beendet.
   *
   * @param editcomment Optionaler Abbruch-Kommentar
   */
  async abortSession(editcomment?: string): Promise<void> {
    if (this.sessionId === null) {
      this.phase = "idle";
      this.currentFeature = null;
      return;
    }

    const sid = this.sessionId;

    try {
      const resp = await fetch(`/api/workflow/session/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edit_comment: editcomment ?? "",
          // Kein version_id → Abbruch-Semantik
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        console.error(
          `[WorkflowSessionManager] Abbruch-PATCH fehlgeschlagen (HTTP ${resp.status}):`,
          text.slice(0, 300),
        );
      }
    } catch (err) {
      console.error(
        "[WorkflowSessionManager] Netzwerkfehler beim Session-Abbruch:",
        err,
      );
    }

    // Session lokal immer aufräumen – auch wenn der PATCH fehlschlug
    this.phase = "completed";
    this.sessionId = null;
    this.versionId = null;
    this.currentFeature = null;
  }

  // -----------------------------------------------------------------------
  // Query-Methoden
  // -----------------------------------------------------------------------

  /** Gibt die aktuell verwaltete Session-ID zurück (`null` wenn idle/completed/error). */
  getSessionId(): number | null {
    return this.sessionId;
  }

  /** Gibt den aktuellen Lifecycle-Zustand zurück. */
  getPhase(): SessionPhase {
    return this.phase;
  }

  /**
   * `true`, wenn eine Session aktiv ist und bearbeitet wird
   * (Phasen: active | saving | closing).
   */
  isActive(): boolean {
    return (
      this.phase === "active" ||
      this.phase === "saving" ||
      this.phase === "closing"
    );
  }
}
