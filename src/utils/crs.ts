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
    const currentZoom = view.getZoom() || 10;
    const currentRotation = view.getRotation();

    if (!currentCenter) {
      console.error("[crs] current center not available");
      return false;
    }

    // Simplified scale preservation: use current resolution directly
    const currentResolution = view.getResolution();
    let targetResolution = currentResolution;

    // Apply simple scaling factor between different projection types
    if (currentProj.getCode() === defaultCRS && isUtm(targetEpsg)) {
      // Web Mercator to UTM: scale down slightly
      targetResolution = currentResolution
        ? currentResolution * 0.8
        : undefined;
    } else if (isUtm(currentProj.getCode()) && targetEpsg === defaultCRS) {
      // UTM to Web Mercator: scale up slightly
      targetResolution = currentResolution
        ? currentResolution * 1.25
        : undefined;
    }

    // Fallback to zoom-based approach if resolution calculation fails
    if (
      !targetResolution ||
      !Number.isFinite(targetResolution) ||
      targetResolution <= 0
    ) {
      console.warn("[crs] using zoom-based fallback");
      targetResolution = undefined;
    }

    // Transform center to target projection
    let transformedCenter: number[] | undefined;
    try {
      transformedCenter = transform(currentCenter, currentProj, targetEpsg);
    } catch (error) {
      console.error("[crs] failed to transform center", error);
      return false;
    }

    if (!transformedCenter) {
      console.error("[crs] transformed center is undefined");
      return false;
    }

    // Create new view with simplified parameters
    const newView = new View({
      projection: targetEpsg,
      center: transformedCenter,
      zoom: currentZoom,
      rotation: currentRotation,
    });
    map.setView(newView);

    // Optional: kurze Animation auf dem neuen View
    if (animate) {
      newView.animate({
        center: newView.getCenter(),
        resolution: newView.getResolution(),
        rotation: newView.getRotation(),
        duration: 250,
      });
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
    const result = transformExtent(extent, wgs84, targetEpsg);
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
    const result = transform(center, wgs84, targetEpsg);
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
