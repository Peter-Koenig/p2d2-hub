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
 * Validate WGS84 coordinate [longitude, latitude]
 */
export function isValidWgs84Coordinate(coord: any): boolean {
  return (
    Array.isArray(coord) &&
    coord.length === 2 &&
    coord.every(Number.isFinite) &&
    coord[0] >= -180 &&
    coord[0] <= 180 &&
    coord[1] >= -90 &&
    coord[1] <= 90
  );
}

/**
 * Validate WGS84 extent [minLon, minLat, maxLon, maxLat]
 */
export function isValidWgs84Extent(extent: any): boolean {
  return (
    Array.isArray(extent) &&
    extent.length === 4 &&
    extent.every(Number.isFinite) &&
    extent[0] >= -180 &&
    extent[0] <= 180 &&
    extent[1] >= -90 &&
    extent[1] <= 90 &&
    extent[2] >= -180 &&
    extent[2] <= 180 &&
    extent[3] >= -90 &&
    extent[3] <= 90 &&
    extent[0] <= extent[2] &&
    extent[1] <= extent[3]
  );
}

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

    // Enhanced view creation with better scale preservation
    const newView = new View({
      projection: targetEpsg,
      center: transformedCenter,
      resolution: targetResolution || undefined,
      zoom: targetResolution ? undefined : currentZoom,
      rotation: currentRotation,
      // Add constraints for better UX
      maxZoom: 21,
      minZoom: 1,
    });

    // Store old view reference for potential rollback
    const oldView = map.getView();

    map.setView(newView);

    // Verify view change was successful
    const actualNewView = map.getView();
    if (
      !actualNewView ||
      actualNewView.getProjection()?.getCode() !== targetEpsg
    ) {
      console.error(
        `[crs] View change verification failed. Expected: ${targetEpsg}, Got: ${actualNewView?.getProjection()?.getCode()}`,
      );
      // Rollback on failure
      map.setView(oldView);
      return false;
    }

    // Optional animation with error handling
    if (animate) {
      try {
        actualNewView.animate({
          center: actualNewView.getCenter(),
          resolution: actualNewView.getResolution(),
          rotation: actualNewView.getRotation(),
          duration: 250,
        });
      } catch (animationError) {
        console.warn(
          "[crs] Animation failed, but view change successful:",
          animationError,
        );
        // Animation failure doesn't affect the core functionality
      }
    }

    console.log(`[crs] Successfully switched to projection: ${targetEpsg}`);
    return true;
  } catch (error) {
    console.error("[crs] error in view preservation", error);

    // Additional error context
    console.error("[crs] Error context:", {
      currentProj: currentProj?.getCode(),
      targetEpsg,
      currentCenter,
      currentZoom,
    });
    return false;
  }
}

/**
 * Transform extent from WGS84 to target projection
 * Enhanced with better error handling and validation
 */

/**
 * Transform extent from WGS84 to target projection
 */
export function transformExtentFromWgs84(
  extent: number[],
  targetEpsg: string,
): number[] | null {
  // Input validation
  if (!extent || !Array.isArray(extent) || extent.length !== 4) {
    console.error("[crs] Invalid extent for transformation:", extent);
    return null;
  }

  if (!extent.every(Number.isFinite)) {
    console.error("[crs] Extent contains non-finite values:", extent);
    return null;
  }

  try {
    const result = transformExtent(extent, wgs84, targetEpsg);

    // Validate result
    if (
      !result ||
      !Array.isArray(result) ||
      result.length !== 4 ||
      !result.every(Number.isFinite)
    ) {
      console.error("[crs] Invalid transformation result:", result);
      return null;
    }

    return result;
  } catch (error) {
    console.error("[crs] failed to transform extent", error);
    console.error("[crs] Transform extent context:", { extent, targetEpsg });
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
  // Input validation
  if (!center || !Array.isArray(center) || center.length !== 2) {
    console.error("[crs] Invalid center for transformation:", center);
    return null;
  }

  if (!center.every(Number.isFinite)) {
    console.error("[crs] Center contains non-finite values:", center);
    return null;
  }

  try {
    const result = transform(center, wgs84, targetEpsg);

    // Validate result
    if (
      !result ||
      !Array.isArray(result) ||
      result.length !== 2 ||
      !result.every(Number.isFinite)
    ) {
      console.error("[crs] Invalid transformation result:", result);
      return null;
    }

    return result;
  } catch (error) {
    console.error("[crs] failed to transform center", error);
    console.error("[crs] Transform center context:", { center, targetEpsg });
    return null;
  }
}

// Pre-register common UTM projections on module load
Object.keys(predefinedUtmDefs).forEach((crs) => {
  registerUtm(crs);
});
