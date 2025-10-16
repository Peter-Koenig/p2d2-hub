import type { Map as OLMap } from 'ol';
import type VectorLayer from 'ol/layer/Vector';
import type TileLayer from 'ol/layer/Tile';

/**
 * Layer Manager for Feature Editor
 * Manages visibility, z-order, and access for multiple map layers
 * Prepares for future layers: GeoTIFF, Orthophoto, Graves, Labels
 */
export class EditorLayerManager {
  private layers: Map<string, VectorLayer<any> | TileLayer<any>>;
  private map: OLMap;

  constructor(map: OLMap) {
    this.map = map;
    this.layers = new Map();
  }

  /**
   * Add layer with name and z-index
   */
  addLayer(name: string, layer: VectorLayer<any> | TileLayer<any>, zIndex: number): void {
    layer.setZIndex(zIndex);
    this.map.addLayer(layer);
    this.layers.set(name, layer);
    console.log(`EditorLayerManager: Added layer "${name}" at z-index ${zIndex}`);
  }

  /**
   * Toggle layer visibility
   */
  toggleLayer(name: string): boolean {
    const layer = this.layers.get(name);
    if (layer) {
      const newVisibility = !layer.getVisible();
      layer.setVisible(newVisibility);
      console.log(`EditorLayerManager: Layer "${name}" visibility: ${newVisibility}`);
      return newVisibility;
    }
    return false;
  }

  /**
   * Set layer visibility explicitly
   */
  setLayerVisible(name: string, visible: boolean): void {
    const layer = this.layers.get(name);
    if (layer) {
      layer.setVisible(visible);
    }
  }

  /**
   * Get layer by name
   */
  getLayer(name: string): VectorLayer<any> | TileLayer<any> | undefined {
    return this.layers.get(name);
  }

  /**
   * Get all layer names
   */
  getLayerNames(): string[] {
    return Array.from(this.layers.keys());
  }
}
