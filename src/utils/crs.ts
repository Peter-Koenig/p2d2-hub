import proj4 from "proj4";
import { register } from "ol/proj/proj4";
import { getPointResolution, transform, transformExtent } from "ol/proj";
import View from "ol/View";

// Default projections
export const defaultCRS = "EPSG:3857";
export const wgs84 = "EPSG:4326";

// Predefined ETRS89 UTM projections
const predefinedUtmDefs: Record<string, string> = {
  "EPSG:25832":
    "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
  "EPSG:25833":
    "+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs",
};

// Track registered projections to avoid duplicate registrations
const registeredProjections = new Set<string>();

/**
 * Check if a CRS is a UTM projection
 */
export function isUtm(crs: string): boolean {
  return /^EPSG:(326\d{2}|327\d{2}|258\d{2})$/.test(crs);
}

/**
 * Register a UTM projection dynamically
 */
export function registerUtm(crs: string): boolean {
  if (registeredProjections.has(crs)) {
    return true; // Already registered
  }

  // Check if it's a predefined UTM
  if (predefinedUtmDefs[crs]) {
    proj4.defs(crs, predefinedUtmDefs[crs]);
    registeredProjections.add(crs);
    register(proj4);
    return true;
  }

  // Handle dynamic UTM zones
  const utmMatch = crs.match(/^EPSG:(326|327|258)(\d{2})$/);
  if (utmMatch) {
    const [, prefix, zoneStr] = utmMatch;
    const zone = parseInt(zoneStr, 10);

    if (zone >= 1 && zone <= 60) {
      const hemisphere = prefix === "327" ? "+south" : "";
      const ellps =
        prefix === "258"
          ? "+ellps=GRS80 +towgs84=0,0,0,0,0,0,0"
          : "+ellps=WGS84";

      const def = `+proj=utm +zone=${zone} ${hemisphere} ${ellps} +units=m +no_defs`;
      proj4.defs(crs, def);
      registeredProjections.add(crs);
      register(proj4);
      return true;
    }
  }

  return false;
}

/**
 * Switch to a new view while preserving scale and rotation
 */
export function toNewViewPreservingScale(
  map: any,
  targetEpsg: string,
  animate: boolean = true,
): boolean {
  const view = map?.getView?.();
  if (!view || !view.getProjection) {
    console.error("[crs] map view is not initialized");
    return false;
  }

  const currentProj = view.getProjection();
  if (!currentProj) {
    console.error("[crs] current projection not available");
    return false;
  }

  if (currentProj.getCode() === targetEpsg) {
    return true; // Already in target projection
  }

  // Register target projection if it's UTM
  if (isUtm(targetEpsg) && !registerUtm(targetEpsg)) {
    console.error("[crs] failed to register UTM projection", targetEpsg);
    return false;
  }

  try {
    const currentCenter = view.getCenter();
    const currentZoom = view.getZoom();
    const currentRotation = view.getRotation();

    if (!currentCenter) {
      console.error("[crs] current center not available");
      return false;
    }

    // Calculate scale preservation
    let targetResolution: number | undefined;

    try {
      console.log(
        "[crs] calculating scale preservation from",
        currentProj.getCode(),
        "to",
        targetEpsg,
      );
      const pointResolution = getPointResolution(currentProj, 1, currentCenter);
      console.log("[crs] pointResolution:", pointResolution);

      if (pointResolution && pointResolution > 0) {
        // Get meters per unit for both projections
        const currentMetersPerUnit = currentProj.getMetersPerUnit() || 1;
        console.log("[crs] currentMetersPerUnit:", currentMetersPerUnit);

        const targetProj = proj4.defs(targetEpsg);
        if (targetProj) {
          const targetMetersPerUnit = 1; // UTM and metric projections use meters
          console.log("[crs] targetMetersPerUnit:", targetMetersPerUnit);

          // Calculate target resolution preserving scale
          targetResolution =
            (pointResolution * currentMetersPerUnit) / targetMetersPerUnit;
          console.log("[crs] calculated targetResolution:", targetResolution);

          // Safety check to avoid invalid resolutions
          if (targetResolution <= 0 || !Number.isFinite(targetResolution)) {
            console.warn("[crs] invalid target resolution, using fallback");
            targetResolution = undefined;
          }
        } else {
          console.warn(
            "[crs] target projection not found in proj4.defs:",
            targetEpsg,
          );
        }
      } else {
        console.warn("[crs] invalid pointResolution, using fallback");
      }
    } catch (error) {
      console.warn(
        "[crs] error calculating scale preservation, using fallback",
        error,
      );
    }

    // Transform center to target projection
    let transformedCenter: number[] | undefined;
    try {
      console.log(
        "[crs] transforming center from",
        currentProj.getCode(),
        "to",
        targetEpsg,
      );
      transformedCenter = transform(currentCenter, currentProj, targetEpsg);
      console.log(
        "[crs] center transformed:",
        currentCenter,
        "->",
        transformedCenter,
      );
    } catch (error) {
      console.error("[crs] failed to transform center", error);
      return false;
    }

    // Create new view
    const newView = new View({
      projection: targetEpsg,
      center: transformedCenter,
      zoom: targetResolution ? undefined : currentZoom,
      resolution: targetResolution,
      rotation: currentRotation,
    });

    if (animate) {
      const targetZoom = targetResolution
        ? newView.getZoomForResolution(targetResolution)
        : currentZoom;
      console.log(
        "[crs] animating to projection:",
        targetEpsg,
        "zoom:",
        targetZoom,
      );
      view.animate({
        center: transformedCenter,
        zoom: targetZoom,
        rotation: currentRotation,
        duration: 300,
      });
    } else {
      console.log("[crs] setting projection:", targetEpsg, "without animation");
      view.setCenter(transformedCenter);
      if (targetResolution) {
        view.setResolution(targetResolution);
      } else {
        view.setZoom(currentZoom || 2);
      }
      view.setRotation(currentRotation);
    }

    return true;
  } catch (error) {
    console.error("[crs] error in view preservation", error);
    return false;
  }
}

/**
 * Transform extent from WGS84 to target projection
 */
export function transformExtentFromWgs84(
  extent: number[],
  targetEpsg: string,
): number[] | null {
  try {
    console.log("[crs] transforming extent from WGS84 to", targetEpsg);
    const result = transformExtent(extent, wgs84, targetEpsg);
    console.log("[crs] extent transformed:", extent, "->", result);
    return result;
  } catch (error) {
    console.error("[crs] failed to transform extent", error);
    return null;
  }
}

/**
 * Transform center from WGS84 to target projection
 */
export function transformCenterFromWgs84(
  center: number[],
  targetEpsg: string,
): number[] | null {
  try {
    console.log("[crs] transforming center from WGS84 to", targetEpsg);
    const result = transform(center, wgs84, targetEpsg);
    console.log("[crs] center transformed:", center, "->", result);
    return result;
  } catch (error) {
    console.error("[crs] failed to transform center", error);
    return null;
  }
}

// Pre-register common UTM projections on module load
Object.keys(predefinedUtmDefs).forEach((crs) => {
  registerUtm(crs);
});
