/**
 * Tab State Persistence Utilities
 * Manages selected tab state across page reloads
 */

const TAB_STORAGE_KEY = "p2d2_selected_tab";

export type TabType = "kommunen" | "kategorien";

/**
 * Get persisted tab selection from localStorage
 */
export function getPersistedTab(): TabType | null {
  if (typeof window === "undefined") return null;

  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    if (saved === "kommunen" || saved === "kategorien") {
      return saved as TabType;
    }
  } catch (error) {
    console.warn("[tab-persistence] Could not read persisted tab:", error);
  }

  return null;
}

/**
 * Persist tab selection to localStorage
 */
export function setPersistedTab(tab: TabType): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab);
  } catch (error) {
    console.warn("[tab-persistence] Could not persist tab:", error);
  }
}

/**
 * Clear persisted tab selection
 */
export function clearPersistedTab(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(TAB_STORAGE_KEY);
  } catch (error) {
    console.warn("[tab-persistence] Could not clear persisted tab:", error);
  }
}
