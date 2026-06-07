// SPDX-FileCopyrightText: 2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2 GrabflurUIManager: Toolbar, Navigation, Layer-Controls, Keyboard
//
// Verbindet DOM-Elemente (Buttons) mit den Grabflur-Manager-Klassen.
// Verwendet Event Delegation auf document-Ebene (wie der bestehende
// Monolith) – stabil gegen Astro-HMR.
//
// Verantwortlichkeiten:
// - Nav-Buttons (back/forward) + Keyboard (Alt+←/→)
// - Layer-Toggle-Buttons + localStorage-Persistenz
// - Toolbar-Buttons (select, move, modify, save, cancel)
// - Keyboard-Shortcuts (S, M, E)

import type { ViewHistoryManager } from "@/utils/view-history-manager";
import type GrabflurLayerManager from "./GrabflurLayerManager";
import type GrabflurInteractionManager from "./GrabflurInteractionManager";
import type GrabflurSessionManager from "./GrabflurSessionManager";
import { RecoveryRequiredError } from "./GrabflurSessionManager";

/**
 * Verbindet die Astro-UI-Komponenten des Grabflur-Editors mit der Logik.
 *
 * Instanziiert von GrabflurEditorApp nachdem alle Sub-Manager bereit sind.
 * bindControls() registriert alle Event-Listener.
 */
export default class GrabflurUIManager {
  private viewHistory: ViewHistoryManager;
  private layerManager: GrabflurLayerManager;
  private interactionManager: GrabflurInteractionManager;
  private sessionManager: GrabflurSessionManager;
  private projection: string;

  constructor(
    viewHistory: ViewHistoryManager,
    layerManager: GrabflurLayerManager,
    interactionManager: GrabflurInteractionManager,
    sessionManager: GrabflurSessionManager,
    projection: string,
  ) {
    this.viewHistory = viewHistory;
    this.layerManager = layerManager;
    this.interactionManager = interactionManager;
    this.sessionManager = sessionManager;
    this.projection = projection;
  }

  /**
   * Einmaliger Aufruf nach der Instanziierung – registriert alle
   * DOM-Event-Listener.
   */
  bindControls(): void {
    this.bindNavigation();
    this.bindLayerToggles();
    this.bindToolbar();
    this.bindKeyboard();
  }

  // -----------------------------------------------------------------------
  // Navigation (Alt+←/→ + Buttons)
  // -----------------------------------------------------------------------

  private bindNavigation(): void {
    const backBtn = document.getElementById("nav-back") as HTMLButtonElement;
    const fwdBtn = document.getElementById("nav-forward") as HTMLButtonElement;

    backBtn?.addEventListener("click", () => this.viewHistory.back());
    fwdBtn?.addEventListener("click", () => this.viewHistory.forward());

    // Initialen Button-Status setzen
    const initState = this.viewHistory.getState();
    if (backBtn) backBtn.disabled = !initState.canGoBack;
    if (fwdBtn) fwdBtn.disabled = !initState.canGoForward;

    // Auf History-Änderungen subscriben
    this.viewHistory.subscribe(
      (state: { canGoBack: boolean; canGoForward: boolean }) => {
        if (backBtn) backBtn.disabled = !state.canGoBack;
        if (fwdBtn) fwdBtn.disabled = !state.canGoForward;
      },
    );

    // Keyboard: Alt+← / Alt+→
    document.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        this.viewHistory.back();
      }
      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        this.viewHistory.forward();
      }
    });
  }

  // -----------------------------------------------------------------------
  // Layer-Toggle (Luftbild, basemap.de)
  // -----------------------------------------------------------------------

  private bindLayerToggles(): void {
    document.addEventListener("click", (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-layer-toggle]",
      );
      if (!btn) return;

      const layerName = btn.dataset.layerToggle;
      if (!layerName) return;

      const layer =
        layerName === "luftbild"
          ? this.layerManager.getLuftbildLayer()
          : layerName === "basemap"
            ? this.layerManager.getBasemapLayer()
            : null;

      if (!layer) {
        console.warn("[GrabflurUIManager] Unbekannter Layer:", layerName);
        return;
      }

      const newVis = !layer.getVisible();
      layer.setVisible(newVis);
      btn.classList.toggle("highlighted", newVis);

      try {
        localStorage.setItem(`${layerName}Visible`, String(newVis));
      } catch {
        // localStorage nicht verfügbar
      }
    });

    // Initiale Layer-Zustände aus localStorage wiederherstellen
    try {
      ["luftbild", "basemap"].forEach((ln) => {
        const saved = localStorage.getItem(`${ln}Visible`) === "true";
        if (ln === "luftbild") {
          this.layerManager.getLuftbildLayer().setVisible(saved);
        }
        if (ln === "basemap") {
          this.layerManager.getBasemapLayer().setVisible(saved);
        }
        const btn = document.querySelector(`[data-layer-toggle="${ln}"]`);
        if (saved && btn) btn.classList.add("highlighted");
      });
    } catch {
      // localStorage nicht verfügbar
    }
  }

  // -----------------------------------------------------------------------
  // Toolbar (Werkzeug-Auswahl, Speichern, Abbrechen)
  // -----------------------------------------------------------------------

  private bindToolbar(): void {
    document.addEventListener("click", async (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-tool]");
      if (!btn) return;
      const tool = btn.dataset.tool;
      if (!tool) return;

      // --- Werkzeug-Auswahl (select, move, modify) ---
      if (["select", "move", "modify"].includes(tool)) {
        if (
          this.interactionManager.getGrabflureSelect() === null &&
          tool === "select"
        ) {
          // Erstes Aktivieren: grabflureSelect wird lazy angelegt
        }
        this.interactionManager.setActiveTool(tool);
        document
          .querySelectorAll("[data-tool]")
          .forEach((b) => b.classList.remove("highlighted"));
        btn.classList.add("highlighted");

        // Edit-Tools sichtbar schalten (falls nicht bereits sichtbar)
        const container = document.getElementById("edit-tools-container");
        container?.classList.remove("edit-tools-hidden");
        container?.classList.add("edit-tools-visible");
        return;
      }

      // --- Speichern ---
      if (tool === "save") {
        await this.handleSave();
        return;
      }

      // --- Abbrechen ---
      if (tool === "cancel") {
        await this.handleCancel();
        return;
      }
    });

    // Initial: Select-Button hervorheben
    document
      .querySelector('[data-tool="select"]')
      ?.classList.add("highlighted");
  }

  /**
   * Speichern-Logik: Commit + Session schließen.
   *
   * 1. Prüft, ob ein Feature im grabflureSelect selektiert ist
   * 2. Extrahiert die Geometrie
   * 3. Ruft sessionManager.commitAndClose() auf
   * 4. Bei Erfolg: exitEditMode + Erfolgsmeldung
   * 5. Bei Fehler: Dialog (Retry oder Abbruch)
   */
  private async handleSave(): Promise<void> {
    const saveBtn = document.getElementById("tool-save") as HTMLButtonElement;
    if (saveBtn) saveBtn.disabled = true;

    const grabflureSelect = this.interactionManager.getGrabflureSelect();
    if (!grabflureSelect || grabflureSelect.getFeatures().getLength() === 0) {
      console.warn("[GrabflurUIManager] Kein Feature selektiert");
      if (saveBtn) saveBtn.disabled = false;
      return;
    }

    const selectedFeature = grabflureSelect.getFeatures().item(0);
    const geometry = selectedFeature.getGeometry();
    if (!geometry) {
      console.warn("[GrabflurUIManager] Feature hat keine Geometrie");
      if (saveBtn) saveBtn.disabled = false;
      return;
    }

    try {
      await this.sessionManager.commitAndClose(geometry, this.projection, "");
      console.log("[GrabflurUIManager] ✅ Session gespeichert");
      alert("Grabflur gespeichert.");
      this.interactionManager.exitEditModeKeepFeatures();
    } catch (e: unknown) {
      if (e instanceof RecoveryRequiredError) {
        // alert wird hier gezeigt (einzige Stelle – SessionManager wirft nur den Error)
        console.error(
          "[GrabflurUIManager] WFS-T endgültig fehlgeschlagen, Session-ID:",
          e.sessionId,
        );
        alert(
          `Fehler beim Speichern. Session-ID: ${e.sessionId}\nBitte Administrator informieren.`,
        );
        await this.sessionManager.abortSession("recovery-required");
      } else {
        // SessionOpenError oder andere Fehler
        console.error("[GrabflurUIManager] Speichern fehlgeschlagen:", e);
        if (saveBtn) saveBtn.disabled = false;
        if (confirm("Fehler beim Speichern. Erneut versuchen?")) {
          document
            .querySelector('[data-tool="save"]')
            ?.dispatchEvent(new Event("click"));
        } else {
          this.interactionManager.exitEditMode();
        }
      }
    }
  }

  /**
   * Abbrechen-Logik: Bestätigungsdialog + Session-Abbruch.
   */
  private async handleCancel(): Promise<void> {
    if (
      !confirm(
        "Bearbeitung abbrechen? Nicht gespeicherte Änderungen gehen verloren.",
      )
    ) {
      return;
    }

    if (this.sessionManager.isSessionActive()) {
      await this.sessionManager.abortSession("");
      console.log("[GrabflurUIManager] Session abgebrochen");
    }

    this.interactionManager.exitEditMode();

    // Tool-Select wieder hervorheben
    document
      .querySelectorAll("[data-tool]")
      .forEach((b) => b.classList.remove("highlighted"));
    document
      .querySelector('[data-tool="select"]')
      ?.classList.add("highlighted");
  }

  // -----------------------------------------------------------------------
  // Keyboard-Shortcuts (S, M, E)
  // -----------------------------------------------------------------------

  private bindKeyboard(): void {
    document.addEventListener("keydown", (e: KeyboardEvent) => {
      // Nicht in Eingabefeldern auslösen
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      // Prüfen, ob die Map noch im DOM ist
      const mapEl = document.getElementById("grabflur-map");
      if (!mapEl || !document.contains(mapEl)) return;

      switch (e.key.toLowerCase()) {
        case "s":
          e.preventDefault();
          this.simulateToolClick("select");
          break;
        case "m":
          e.preventDefault();
          this.simulateToolClick("move");
          break;
        case "e":
          e.preventDefault();
          this.simulateToolClick("modify");
          break;
      }
    });
  }

  /**
   * Simuliert einen Klick auf einen Tool-Button.
   * Verwendet dispatchEvent, um die Event-Delegation in bindToolbar()
   * korrekt zu durchlaufen.
   */
  private simulateToolClick(toolName: string): void {
    const btn = document.querySelector<HTMLElement>(
      `[data-tool="${toolName}"]`,
    );
    if (btn) {
      btn.dispatchEvent(new Event("click"));
    }
  }
}
