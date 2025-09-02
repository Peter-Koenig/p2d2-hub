// Simple throttle implementation
function throttle<T extends (...args: any[]) => void>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastExecTime = 0;

  return (...args: Parameters<T>) => {
    const currentTime = Date.now();

    if (currentTime - lastExecTime < delay) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(
        () => {
          lastExecTime = currentTime;
          func(...args);
        },
        delay - (currentTime - lastExecTime),
      );
    } else {
      lastExecTime = currentTime;
      func(...args);
    }
  };
}

// Throttle map for event handling
const throttleMap = new Map<string, any>();

/**
 * Dispatch a throttled event
 */
export function dispatchThrottledEvent(
  eventName: string,
  detail: any = {},
  throttleMs: number = 300,
): void {
  if (typeof window === "undefined") return;

  let throttledFunc = throttleMap.get(eventName);
  if (!throttledFunc) {
    throttledFunc = throttle(() => {
      console.log("[events] throttled dispatch:", eventName, detail);
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    }, throttleMs);
    throttleMap.set(eventName, throttledFunc);
  }

  throttledFunc();
}

/**
 * Dispatch kommunen focus event
 */
export function dispatchKommunenFocus(detail: {
  center?: number[];
  extent?: number[];
  zoom?: number;
  projection?: string;
  extra?: any;
}): void {
  if (typeof window === "undefined") return;

  // Validate data before dispatch
  const hasValidCenter =
    detail.center &&
    Array.isArray(detail.center) &&
    detail.center.length === 2 &&
    detail.center.every(Number.isFinite) &&
    detail.center[0] >= -180 &&
    detail.center[0] <= 180 &&
    detail.center[1] >= -90 &&
    detail.center[1] <= 90;

  const hasValidExtent =
    detail.extent &&
    Array.isArray(detail.extent) &&
    detail.extent.length === 4 &&
    detail.extent.every(Number.isFinite) &&
    detail.extent[0] >= -180 &&
    detail.extent[2] <= 180 &&
    detail.extent[1] >= -90 &&
    detail.extent[3] <= 90;

  if (!hasValidCenter && !hasValidExtent) {
    console.warn(
      "[events] skipping kommunen focus - no valid center or extent data",
      detail,
    );
    return;
  }

  window.dispatchEvent(new CustomEvent("kommunen:focus", { detail }));
}

// Make dispatchKommunenFocus globally available for event delegation
if (typeof window !== "undefined") {
  (window as any).dispatchKommunenFocus = dispatchKommunenFocus;
}

/**
 * Add event listener with HMR guard
 */
export function addEventListener(
  eventName: string,
  handler: (event: any) => void,
  options?: AddEventListenerOptions,
): void {
  if (typeof window === "undefined") return;

  // HMR guard - check if this is a hot reload
  const isHmr = typeof import.meta !== "undefined" && import.meta.hot;

  if (isHmr) {
    // For HMR, we need to be careful about duplicate listeners
    const existingHandler = (window as any)[`__${eventName}_handler__`];
    if (existingHandler) {
      window.removeEventListener(eventName, existingHandler);
    }

    (window as any)[`__${eventName}_handler__`] = handler;
    window.addEventListener(eventName, handler, options);
  } else {
    window.addEventListener(eventName, handler, options);
  }
}

// Local storage keys
const STORAGE_KEYS = {
  SELECTED_CRS: "p2d2_selected_crs",
  SELECTED_KOMMUNE: "p2d2_selected_kommune",
};

/**
 * Get selected CRS from local storage
 */
export function getSelectedCRS(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.SELECTED_CRS);
}

/**
 * Set selected CRS in local storage
 */
export function setSelectedCRS(crs: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.SELECTED_CRS, crs);
}

/**
 * Get selected Kommune from local storage
 */
export function getSelectedKommune(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEYS.SELECTED_KOMMUNE);
}

/**
 * Set selected Kommune in local storage
 */
export function setSelectedKommune(slug: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.SELECTED_KOMMUNE, slug);
}

/**
 * Clear all stored selections
 */
export function clearSelections(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEYS.SELECTED_CRS);
  localStorage.removeItem(STORAGE_KEYS.SELECTED_KOMMUNE);
}
