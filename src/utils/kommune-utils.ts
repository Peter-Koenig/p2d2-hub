import { getCollection } from "astro:content";
import { getContainerTypeForCategory } from "./kategorie-utils";

// Central configuration for default kommune
export const DEFAULT_KOMMUNE_SLUG = "koeln";

// Interface for kommune data
export interface KommuneData {
  slug: string;
  title: string;
  osmAdminLevels?: number[];
  wp_name: string;
  colorStripe: string;
  map: {
    center: [number, number];
    zoom: number;
    projection: string;
    extent?: [number, number, number, number];
    extra?: Record<string, any>;
  };
  order?: number;
  icon?: string;
}

/**
 * Get all kommunen from content collections
 */
export async function getAllKommunen(): Promise<KommuneData[]> {
  try {
    const kommunenCollection = await getCollection("kommunen");

    return kommunenCollection
      .map((kommune) => ({
        slug: kommune.slug,
        title: kommune.data.title,
        osmAdminLevels: kommune.data.osmAdminLevels,
        wp_name: kommune.data.wp_name,
        colorStripe: kommune.data.colorStripe,
        map: {
          center: kommune.data.map.center || [0, 0],
          zoom: kommune.data.map.zoom || 11,
          projection: kommune.data.map.projection || "EPSG:3857",
          extent: kommune.data.map.extent,
          extra: kommune.data.map.extra,
        },
        order: kommune.data.order,
        icon: kommune.data.icon,
      }))
      .sort((a, b) => (a.order || 999) - (b.order || 999));
  } catch (error) {
    console.error("Error loading kommunen:", error);
    return [];
  }
}

/**
 * Get default kommune data
 * Falls back to first available kommune if default is not found
 */
export async function getDefaultKommune(): Promise<KommuneData> {
  const kommunen = await getAllKommunen();

  // Try to find default kommune
  const defaultKommune = kommunen.find((k) => k.slug === DEFAULT_KOMMUNE_SLUG);

  if (defaultKommune) {
    return defaultKommune;
  }

  // Fallback to first kommune if default not found
  if (kommunen.length > 0) {
    console.warn(
      `Default kommune '${DEFAULT_KOMMUNE_SLUG}' not found, using '${kommunen[0].slug}' instead`,
    );
    return kommunen[0];
  }

  // Fallback to hardcoded values if no kommunen available
  console.error(
    "No kommunen found in content collections, using fallback values",
  );
  return {
    slug: DEFAULT_KOMMUNE_SLUG,
    title: "Köln",
    osmAdminLevels: [4, 9, 10],
    wp_name: "de-Köln",
    colorStripe: "#FF6900",
    map: {
      center: [6.9603, 50.9375],
      zoom: 11,
      projection: "EPSG:25832",
    },
  };
}

/**
 * Get kommune data by slug
 */
export async function getKommuneBySlug(
  slug: string,
): Promise<KommuneData | null> {
  const kommunen = await getAllKommunen();
  return kommunen.find((k) => k.slug === slug) || null;
}

/**
 * Get kommune data for map focus event
 */
export async function getKommuneMapData(slug: string): Promise<{
  center: [number, number];
  zoom: number;
  projection: string;
  extent?: [number, number, number, number];
  extra?: Record<string, any>;
} | null> {
  const kommune = await getKommuneBySlug(slug);

  if (!kommune) {
    return null;
  }

  return {
    center: kommune.map.center,
    zoom: kommune.map.zoom,
    projection: kommune.map.projection,
    extent: kommune.map.extent,
    extra: kommune.map.extra,
  };
}

/**
 * Check if a kommune exists
 */
export async function kommuneExists(slug: string): Promise<boolean> {
  const kommunen = await getAllKommunen();
  return kommunen.some((k) => k.slug === slug);
}

/**
 * Get container type for a category within a specific kommune context
 * This combines kommune and category logic for container type resolution
 */
export async function getKommuneCategoryContainerType(
  kommuneSlug: string,
  categorySlug: string,
): Promise<string | null> {
  // First verify the kommune exists
  const kommuneExistsResult = await kommuneExists(kommuneSlug);
  if (!kommuneExistsResult) {
    console.warn(`Kommune '${kommuneSlug}' not found`);
    return null;
  }

  // Then get the container type for the category
  return await getContainerTypeForCategory(categorySlug);
}

/**
 * Check if a kommune and category combination has a valid container type mapping
 */
export async function hasKommuneCategoryContainerType(
  kommuneSlug: string,
  categorySlug: string,
): Promise<boolean> {
  const containerType = await getKommuneCategoryContainerType(
    kommuneSlug,
    categorySlug,
  );
  return containerType !== null;
}
