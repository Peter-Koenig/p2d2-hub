// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Kategorie-Utilities — Astro-Adapter auf @p2d2/core.
//
// Die Datenbeschaffung (getCollection('kategorien')) und der Cache bleiben
// hier; die pure Mapping-Logik liegt in @p2d2/core.
import { getCollection } from "astro:content";
import { buildKategorieContainerMapping } from "@p2d2/core";
import type { KategorieData } from "@p2d2/core";

// Cache for category mappings to avoid repeated content collection calls
let categoryMappingsCache: Map<string, string> | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 30000; // 30 seconds cache

/**
 * Get all categories with their container mappings from content collections
 */
export async function getAllKategorien(): Promise<KategorieData[]> {
  try {
    const kategorienCollection = await getCollection("kategorien");

    return kategorienCollection
      .map((kategorie) => ({
        slug: kategorie.slug,
        title: kategorie.data.title,
        icon: kategorie.data.icon,
        order: kategorie.data.order,
        description: kategorie.data.description,
        containerType: kategorie.data.containerType,
      }))
      .sort((a, b) => a.order - b.order);
  } catch (error) {
    console.error("Error loading kategorien:", error);
    return [];
  }
}

/**
 * Get dynamic category to container type mapping
 * Uses caching for better performance
 */
export async function getKategorieContainerMapping(): Promise<
  Record<string, string>
> {
  // Return cached result if available and not expired
  if (
    categoryMappingsCache &&
    Date.now() - cacheTimestamp < CACHE_DURATION_MS
  ) {
    return Object.fromEntries(categoryMappingsCache);
  }

  const kategorien = await getAllKategorien();
  const mapping = buildKategorieContainerMapping(kategorien);

  // Update cache
  categoryMappingsCache = new Map(Object.entries(mapping));
  cacheTimestamp = Date.now();

  return mapping;
}

/**
 * Get container type for a specific category slug
 * Returns null if category not found or no container type defined
 */
export async function getContainerTypeForCategory(
  slug: string,
): Promise<string | null> {
  const mapping = await getKategorieContainerMapping();
  return mapping[slug] || null;
}

/**
 * Check if a category exists and has a container type mapping
 */
export async function hasContainerType(slug: string): Promise<boolean> {
  const mapping = await getKategorieContainerMapping();
  return slug in mapping;
}

/**
 * Get all category slugs that have container type mappings
 */
export async function getMappedCategorySlugs(): Promise<string[]> {
  const mapping = await getKategorieContainerMapping();
  return Object.keys(mapping);
}

/**
 * Clear the category mappings cache
 * Useful for development or when content changes
 */
export function clearKategorieCache(): void {
  categoryMappingsCache = null;
  cacheTimestamp = 0;
}

export type { KategorieData } from "@p2d2/core";
