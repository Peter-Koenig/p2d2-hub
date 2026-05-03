// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
/**
 * UTM Projection Resolutions Utility
 *
 * Provides correct resolutions for ALL UTM projections (EPSG:25832, EPSG:25833, etc.)
 * to avoid OpenLayers fallback to EPSG:3857 (Mercator) resolutions.
 *
 * @module utm-resolutions
 */

/**
 * Calculate resolutions array for UTM projections
 *
 * UNIVERSAL: Works for all 60 UTM zones (Zone 1-60, North/South)
 * All UTM zones use identical Transverse Mercator parameters.
 *
 * @param maxResolution - Maximum resolution at zoom 0 (meters per pixel). Default: 15000
 * @param maxZoom - Maximum zoom level. Default: 28
 * @returns Array of resolutions for each zoom level
 *
 * @example
 * ```
 * // For EPSG:25832 (Köln), EPSG:25833 (Berlin), EPSG:32610 (San Francisco), etc.
 * const resolutions = calculateUtmResolutions();
 *
 * const map = new OLMap({
 *   view: new View({
 *     projection: 'EPSG:25832',
 *     resolutions: resolutions,
 *     constrainResolution: false
 *   })
 * });
 * ```
 */
export function calculateUtmResolutions(
  maxResolution: number = 15000,
  maxZoom: number = 28
): number[] {
  const resolutions: number[] = [];

  for (let z = 0; z <= maxZoom; z++) {
    resolutions.push(maxResolution / Math.pow(2, z));
  }

  return resolutions;
}

/**
 * Check if a projection is a UTM projection
 *
 * @param projection - EPSG code (e.g., "EPSG:25832")
 * @returns true if projection is UTM
 */
export function isUtmProjection(projection: string): boolean {
  // EPSG:32601-32660 (WGS84 UTM North)
  // EPSG:32701-32760 (WGS84 UTM South)
  // EPSG:25828-25838 (ETRS89 UTM Zones 28N-38N)
  return /^EPSG:(326[0-9]{2}|327[0-9]{2}|258[2-3][0-9])$/.test(projection);
}

/**
 * Get recommended maxResolution for a projection
 *
 * @param projection - EPSG code
 * @returns Recommended maxResolution in meters per pixel
 */
export function getRecommendedMaxResolution(projection: string): number {
  if (isUtmProjection(projection)) {
    return 15000;  // ~15km/px at zoom 0 for all UTM zones
  }

  // EPSG:3857 (Web Mercator)
  if (projection === 'EPSG:3857') {
    return 156543.03;  // Standard Web Mercator
  }

  // Fallback
  return 15000;
}
