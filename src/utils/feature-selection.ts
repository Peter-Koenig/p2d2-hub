/**
 * Feature Selection Handler
 * Manages feature selection and highlighting
 */

import type { Map } from "ol";
import { Select } from "ol/interaction";
import { Style, Stroke, Fill, Circle } from "ol/style";
import type VectorSource from "ol/source/Vector";

export class FeatureSelectionHandler {
  private map: Map;
  private selectInteraction: Select;
  private categorySource: VectorSource;

  constructor(map: Map, categorySource: VectorSource) {
    this.map = map;
    this.categorySource = categorySource;
    this.setupSelection();
    this.setupEventListeners();
  }

  private setupSelection(): void {
    // Create selection style
    const selectStyle = new Style({
      stroke: new Stroke({
        color: "#0066FF",
        width: 3,
      }),
      fill: new Fill({
        color: "rgba(0, 102, 255, 0.2)",
      }),
      image: new Circle({
        radius: 7,
        fill: new Fill({
          color: "#0066FF",
        }),
      }),
    });

    // Create select interaction
    this.selectInteraction = new Select({
      style: selectStyle,
      condition: (event) => {
        return event.type === "singleclick";
      },
    });

    this.map.addInteraction(this.selectInteraction);

    // Handle feature selection events
    this.selectInteraction.on("select", this.handleFeatureSelect.bind(this));
  }

  private setupEventListeners(): void {
    // Listen for category source changes to re-select features
    this.categorySource.on("change", () => {
      if (this.categorySource.getState() === "ready") {
        this.reselectFeature();
      }
    });
  }

  private handleFeatureSelect(event: any): void {
    const selectedFeatures = event.selected;
    const deselectedFeatures = event.deselected;

    if (selectedFeatures.length > 0) {
      const feature = selectedFeatures[0];
      const featureId =
        feature.getId() || feature.get("id") || feature.get("fid");
      const featureProps = {
        type: feature.get("type"),
        name: feature.get("name"),
      };

      this.persistFeatureSelection(featureId, featureProps);
    }

    if (deselectedFeatures.length > 0) {
      this.clearFeatureSelection();
    }
  }

  private persistFeatureSelection(featureId: any, featureProps: any): void {
    try {
      localStorage.setItem("selectedFeatureId", featureId.toString());
      localStorage.setItem(
        "selectedFeatureProps",
        JSON.stringify(featureProps),
      );
    } catch (error) {
      console.warn(
        "[feature-selection] Could not persist feature selection:",
        error,
      );
    }
  }

  private clearFeatureSelection(): void {
    try {
      localStorage.removeItem("selectedFeatureId");
      localStorage.removeItem("selectedFeatureProps");
    } catch (error) {
      console.warn(
        "[feature-selection] Could not clear feature selection:",
        error,
      );
    }
  }

  public reselectFeature(): void {
    try {
      const featureId = localStorage.getItem("selectedFeatureId");
      if (featureId && this.categorySource.getState() === "ready") {
        const feature = this.categorySource.getFeatureById(featureId);
        if (feature) {
          this.selectInteraction.getFeatures().clear();
          this.selectInteraction.getFeatures().push(feature);
        }
      }
    } catch (error) {
      console.warn("[feature-selection] Could not reselect feature:", error);
    }
  }

  public clearSelection(): void {
    this.selectInteraction.getFeatures().clear();
    this.clearFeatureSelection();
  }

  public getSelectInteraction(): Select {
    return this.selectInteraction;
  }

  public destroy(): void {
    this.map.removeInteraction(this.selectInteraction);
  }
}
