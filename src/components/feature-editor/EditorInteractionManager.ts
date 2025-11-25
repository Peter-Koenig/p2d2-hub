import type { Map as OLMap } from 'ol';
import type { Feature } from "ol";
import type { Geometry } from "ol/geom";
import Overlay from "ol/Overlay";
import { Style, Stroke, Fill } from "ol/style";
import Select from 'ol/interaction/Select';
import Modify from 'ol/interaction/Modify';
import Translate from 'ol/interaction/Translate';
import Draw from 'ol/interaction/Draw';
import Snap from 'ol/interaction/Snap';
import { click } from 'ol/events/condition';
import type { EditorState } from './EditorState';
import type { EditorLayerManager } from './EditorLayerManager';
import { MAP_CONFIG } from '@/config/map-config';

/**
 * Verwaltet alle Karten-Interaktionen (Hover, Klick, WFS-T-Werkzeuge).
 */
export class EditorInteractionManager {
    private map: OLMap;
    private state: EditorState;
    private layerManager: EditorLayerManager;
    
    private hoverPopup: Overlay;
    private hoverFeature: Feature | null = null;
    private hoverTimeout: number | null = null;
    
    // Interaktionen
    private select: Select;
    private modify: Modify;
    private translate: Translate;
    private draw: Draw;
    private snap: Snap;

    // --- Styles ---
    private readonly HOVER_STYLE = new Style({
        stroke: new Stroke({ color: "#dc2626", width: 3 }),
        fill: new Fill({ color: "rgba(234, 88, 12, 0.4)" }),
    }); [cite: 1114-1116]

    constructor(map: OLMap, state: EditorState, layerManager: EditorLayerManager) {
        this.map = map;
        this.state = state;
        this.layerManager = layerManager;

        this.initHoverPopup(); [cite: 1137-1139]
        this.initClickZoom(); [cite: 1162]
        this.initWfsTInteractions();
        
        // Standard-Werkzeug aktivieren
        this.setTool("select");
    }

    /**
     * Initialisiert das Hover-Popup für Grabflure.
     */
    private initHoverPopup() {
        const popupElement = document.createElement("div");
        popupElement.className = "grabflur-hover-popup"; [cite: 794]
        document.body.appendChild(popupElement);

        this.hoverPopup = new Overlay({
            element: popupElement,
            positioning: "bottom-center",
            offset: [0, -10],
            stopEvent: false,
        }); [cite: 1138]
        this.map.addOverlay(this.hoverPopup);

        this.map.on("pointermove", (evt) => { [cite: 1142]
            if (evt.dragging) return;

            const grabflurLayer = this.layerManager.getLayer("grabflur");
            let featureAtPixel: Feature | null = null;
            
            this.map.forEachFeatureAtPixel(evt.pixel, (f, layer) => {
                if (layer === grabflurLayer) {
                    featureAtPixel = f as Feature;
                    return true;
                }
            }); [cite: 1144-1145]

            if (featureAtPixel !== this.hoverFeature) {
                if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
                
                if (this.hoverFeature) {
                    // Reset style only if not selected
                    if (this.hoverFeature !== this.state.getSelectedFeature()) {
                        this.hoverFeature.setStyle(undefined); // Verwendet Layer-Stil
                    }
                }
                
                if (!featureAtPixel) {
                    this.hoverPopup.setPosition(undefined);
                }

                this.hoverFeature = featureAtPixel;

                if (featureAtPixel) {
                    featureAtPixel.setStyle(this.HOVER_STYLE); [cite: 1152]

                    this.hoverTimeout = window.setTimeout(() => { [cite: 1153]
                        const name = featureAtPixel.get("name") || "Unbenannt";
                        const number = this.extractGrabflurNumber(name);
                        popupElement.innerHTML = `
                            <div style="font-weight: 600; color: #dc2626; margin-bottom: 4px;">Grabflur ${number}</div>
                            <div style="font-size: 12px; color: #6b7280;">${name}</div>
                        `; [cite: 1155-1158]
                        this.hoverPopup.setPosition(evt.coordinate);
                    }, 600);
                }
            }
        });
    }

    /**
     * Initialisiert das Klick-Verhalten zum Zoomen auf Grabflure.
     */
    private initClickZoom() {
        this.map.on("click", (evt) => { [cite: 1162]
            // Nur ausführen, wenn 'select'-Werkzeug aktiv ist
            if (this.state.getTool() !== 'select') return;

            const grabflurLayer = this.layerManager.getLayer("grabflur");
            let clickedFeature: Feature | null = null;
            
            this.map.forEachFeatureAtPixel(evt.pixel, (f, layer) => {
                if (layer === grabflurLayer) {
                    clickedFeature = f as Feature;
                    return true;
                }
            }); [cite: 1164]

            if (clickedFeature) {
                this.state.setSelectedFeature(clickedFeature);
                this.zoomToFeature(clickedFeature); [cite: 1167]
            }
        });
    }

    private zoomToFeature(feature: Feature) {
        const geometry = feature.getGeometry();
        if (!geometry) return;

        const extent = geometry.getExtent();
        const view = this.map.getView();
        const mapSize = this.map.getSize();
        if (!mapSize) return;

        (this.map as any).isProgrammaticZoom = true; [cite: 1195]

        view.fit(extent, {
            size: mapSize,
            duration: 300,
            padding: [40, 40, 40, 40], [cite: 1178]
            maxZoom: 21, [cite: 1189]
            callback: () => { [cite: 1198]
                (this.map as any).isProgrammaticZoom = false; [cite: 1199]
                // Ansicht nach Animation speichern
                const viewHistory = (window as any).navigationControls?.viewHistory;
                if (viewHistory) {
                    viewHistory.pushState(); [cite: 1208]
                }
            }
        });
    }
    
    /**
     * Initialisiert die WFS-T Interaktionen (Select, Modify, Translate, Draw).
     */
    private initWfsTInteractions() {
        const grabflurSource = this.layerManager.getGrabflurSource();
        if (!grabflurSource) {
            console.error("Grabflur-Source nicht gefunden. WFS-T-Interaktionen können nicht initialisiert werden.");
            return;
        }

        // Select (wird auch für Modify/Translate benötigt)
        this.select = new Select({
            condition: click,
            layers: [this.layerManager.getLayer("grabflur")],
            style: this.HOVER_STYLE, // Nutze Hover-Stil für Selektion
        });

        this.select.on('select', (e) => {
            const selected = e.selected.length > 0 ? e.selected[0] : null;
            this.state.setSelectedFeature(selected as Feature<Geometry>);
        });

        // Modify (Geometrie-Punkte ändern)
        this.modify = new Modify({
            features: this.select.getFeatures(),
        });

        // Translate (Feature verschieben)
        this.translate = new Translate({
            features: this.select.getFeatures(),
        });

        // Draw (Neue Features zeichnen)
        this.draw = new Draw({
            source: grabflurSource,
            type: 'Polygon',
        });

        // Snap (An anderen Features einrasten)
        this.snap = new Snap({
            source: grabflurSource,
        });
    }
    
    /**
     * Aktiviert das ausgewählte Werkzeug und deaktiviert die anderen.
     */
    public setTool(toolName: 'select' | 'move' | 'draw') {
        this.state.setTool(toolName);
        
        // Alle Interaktionen entfernen
        this.map.removeInteraction(this.select);
        this.map.removeInteraction(this.modify);
        this.map.removeInteraction(this.translate);
        this.map.removeInteraction(this.draw);
        this.map.removeInteraction(this.snap);

        // Gewünschte Interaktionen hinzufügen
        switch (toolName) {
            case 'select':
                this.map.addInteraction(this.select);
                break;
            
            case 'move':
                this.map.addInteraction(this.select);
                this.map.addInteraction(this.translate);
                break;
                
            case 'draw':
                this.map.addInteraction(this.draw);
                this.map.addInteraction(this.snap);
                break;
            
            // TODO: 'modify' (Punkte bearbeiten)
        }
    }

    private extractGrabflurNumber(name: string): string {
        if (!name) return "?";
        const match = name.match(/-(\d+)$/);
        return match ? match[1] : name;
    }
}
