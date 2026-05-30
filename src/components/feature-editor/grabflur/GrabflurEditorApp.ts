// SPDX-FileCopyrightText: 2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2 GrabflurEditorApp: Orchestriert alle Sub-Manager des Grabflur-Editors
//
// Analog zu EditorApp.ts aus dem generischen Feature-Editor, aber spezifisch
// für den Grabflur-Editor mit zwei Layern (Friedhof + Grabflure) und
// Session-Lifecycle.
//
// Ablauf in init():
//   1. Config aus data-Attributen lesen
//   2. GrabflurMapManager → Map + ViewHistory
//   3. GrabflurLayerManager → Layer registrieren
//   4. GrabflurDataManager → WFS-Bereitschaft
//   5. GrabflurSessionManager → Session-State
//   6. GrabflurInteractionManager → Hover + Klick + Edit-Tools
//   7. GrabflurUIManager → Toolbar, Nav, Layer-Controls, Keyboard
//   8. Cross-Window-Bridge initialisieren
//   9. map.once('postrender') → WFS-Daten laden → fitToSource()

import GrabflurMapManager from "./GrabflurMapManager";
import GrabflurLayerManager from "./GrabflurLayerManager";
import GrabflurDataManager from "./GrabflurDataManager";
import GrabflurSessionManager from "./GrabflurSessionManager";
import GrabflurInteractionManager from "./GrabflurInteractionManager";
import GrabflurUIManager from "./GrabflurUIManager";
import {
  dispatchCrossWindowEvent,
  initializeCrossWindowBridge,
  getWindowId,
} from "@/utils/cross-window-events";
import { P2D2EventType } from "@/utils/events";

/**
 * Haupt-App-Klasse für den Grabflur-Editor.
 *
 * Orchestriert alle Sub-Manager und steuert den Bootstrap-Ablauf.
 * Einmal pro Seiten-Load instanziiert, lebt im <script>-Block der
 * grabflur-editor.astro-Seite.
 */
export default class GrabflurEditorApp {
  private container: HTMLElement;
  private mapManager!: GrabflurMapManager;
  private layerManager!: GrabflurLayerManager;
  private dataManager!: GrabflurDataManager;
  private sessionManager!: GrabflurSessionManager;
  private interactionManager!: GrabflurInteractionManager;
  private uiManager!: GrabflurUIManager;

  /** Aus data-Attributen gelesene Konfiguration */
  private wpName = "";
  private projection = "EPSG:3857";
  private municipality = "";

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * Initialisiert den Grabflur-Editor.
   *
   * 1. Liest data-Attribute aus dem Container
   * 2. Erstellt alle Sub-Manager
   * 3. Lädt Friedhofsdaten via WFS (nach erstem postrender)
   * 4. Zoomt auf die geladenen Features
   */
  async init(): Promise<void> {
    try {
      // 1. Config aus data-Attributen lesen
      this.wpName = this.container.dataset.wpName || "";
      this.projection = this.container.dataset.projection || "EPSG:3857";
      this.municipality = this.container.dataset.municipality || "";

      if (!this.wpName) {
        console.warn(
          "[GrabflurEditorApp] Kein wpName in data-Attributen – Editor kann nicht starten.",
        );
        return;
      }

      // 2. Cross-Window-Bridge initialisieren
      initializeCrossWindowBridge();

      // 3. MapManager (erstellt Karte + ViewHistory + deaktiviert DblClickZoom)
      this.mapManager = new GrabflurMapManager(
        this.container.id,
        this.projection,
      );
      const map = this.mapManager.getMap();
      const viewHistory = this.mapManager.getViewHistory();

      // 4. LayerManager (erstellt alle Layer und Hover-Popup)
      this.layerManager = new GrabflurLayerManager(map, this.projection);

      // 5. DataManager (WFS-Laden, kein map-/view-Zugriff)
      this.dataManager = new GrabflurDataManager();

      // 6. SessionManager (Session-State-Maschine)
      this.sessionManager = new GrabflurSessionManager();

      // 7. InteractionManager (Hover, Klick, Edit-Tools)
      this.interactionManager = new GrabflurInteractionManager(
        map,
        this.layerManager,
        this.dataManager,
        this.sessionManager,
        viewHistory,
        this.projection,
        this.municipality,
      );

      // 8. UIManager (UI-Controls, Keyboard)
      this.uiManager = new GrabflurUIManager(
        viewHistory,
        this.layerManager,
        this.interactionManager,
        this.sessionManager,
        this.projection,
      );
      this.uiManager.bindControls();

      // 9. WFS-Daten NACH erstem postrender laden (Race-Condition-Schutz)
      map.once("postrender", async () => {
        map.updateSize();

        try {
          console.log("[GrabflurEditorApp] Lade Friedhöfe via WFS...");
          const features = await this.dataManager.loadFriedhoefe(
            this.wpName,
            this.projection,
          );

          if (features.length === 0) {
            console.warn("[GrabflurEditorApp] Keine Friedhöfe geladen.");
            return;
          }

          // Features zum Layer hinzufügen
          this.layerManager.getFriedhofSource().addFeatures(features);

          console.log(
            `[GrabflurEditorApp] ✅ ${features.length} Friedhöfe geladen`,
          );

          // Auf geladene Features zoomen (mit postrender-Guard)
          this.mapManager.fitToSource(this.layerManager.getFriedhofSource(), {
            padding: [50, 50, 50, 50],
            maxZoom: 16,
          });

          // Ready-Event dispatchen
          dispatchCrossWindowEvent(P2D2EventType.EDITOR_READY, {
            windowId: getWindowId(),
            wpName: this.wpName,
            containerType: "grabflur",
            timestamp: Date.now(),
          });
        } catch (err) {
          console.error("[GrabflurEditorApp] WFS-Fehler:", err);
          this.showError(
            err instanceof Error ? err.message : "Unbekannter Fehler",
          );
        }
      });

      // Sicherstellen, dass ein Render getriggert wird
      map.render();
    } catch (err) {
      console.error("[GrabflurEditorApp] Initialisierungsfehler:", err);
      this.showError(err instanceof Error ? err.message : "Unbekannter Fehler");
    }
  }

  /**
   * Zeigt eine Fehlermeldung im Map-Container an.
   */
  private showError(message: string): void {
    if (!this.container) return;
    const errDiv = document.createElement("div");
    errDiv.className =
      "absolute inset-0 flex items-center justify-center bg-white/80 z-50";
    errDiv.innerHTML = `<p class="text-red-600 font-medium">Fehler beim Laden der Friedhöfe:<br>
      <span class="text-sm font-normal">${message}</span></p>`;
    this.container.style.position = "relative";
    this.container.appendChild(errDiv);
  }
}
