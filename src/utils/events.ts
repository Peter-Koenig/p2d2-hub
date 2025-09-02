/**
 * Robust Event Handling with Retry Mechanism
 * Provides reliable event dispatching for p2d2 kommune focus events
 */

// Event queue for retry mechanism
interface QueuedEvent {
  eventName: string;
  detail: any;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

// Global event queue and processing state
const eventQueue: QueuedEvent[] = [];
let isProcessingQueue = false;
const MAX_RETRIES = 3;
const RETRY_DELAY = 250; // ms
const QUEUE_PROCESS_INTERVAL = 100; // ms

// Throttle tracking
const lastDispatchTimes = new Map<string, number>();
const THROTTLE_MS = 200; // Reduced for better responsiveness

/**
 * Enhanced throttle implementation with queue integration
 */
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

/**
 * Check if event system is ready
 */
function isEventSystemReady(): boolean {
  return (
    typeof window !== "undefined" &&
    window.dispatchEvent !== undefined &&
    document !== undefined &&
    document.readyState !== "loading"
  );
}

/**
 * Process event queue with retry mechanism
 */
function processEventQueue(): void {
  if (isProcessingQueue || eventQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;

  while (eventQueue.length > 0) {
    const queuedEvent = eventQueue.shift();
    if (!queuedEvent) break;

    try {
      if (isEventSystemReady()) {
        // Dispatch the event
        window.dispatchEvent(
          new CustomEvent(queuedEvent.eventName, {
            detail: queuedEvent.detail,
          }),
        );
        console.log(
          `[events] successfully dispatched ${queuedEvent.eventName} after ${queuedEvent.retryCount} retries`,
        );
      } else {
        // Event system not ready, requeue with retry
        if (queuedEvent.retryCount < queuedEvent.maxRetries) {
          queuedEvent.retryCount++;
          eventQueue.unshift(queuedEvent);
          console.log(
            `[events] requeuing ${queuedEvent.eventName}, retry ${queuedEvent.retryCount}/${queuedEvent.maxRetries}`,
          );
        } else {
          console.warn(
            `[events] max retries exceeded for ${queuedEvent.eventName}`,
          );
        }
      }
    } catch (error) {
      console.error(
        `[events] error dispatching ${queuedEvent.eventName}:`,
        error,
      );

      // Requeue on error if retries remain
      if (queuedEvent.retryCount < queuedEvent.maxRetries) {
        queuedEvent.retryCount++;
        eventQueue.unshift(queuedEvent);
        console.log(
          `[events] requeuing after error, retry ${queuedEvent.retryCount}/${queuedEvent.maxRetries}`,
        );
      } else {
        console.warn(
          `[events] max retries exceeded after error for ${queuedEvent.eventName}`,
        );
      }
    }
  }

  isProcessingQueue = false;

  // Continue processing if queue is not empty
  if (eventQueue.length > 0) {
    setTimeout(processEventQueue, QUEUE_PROCESS_INTERVAL);
  }
}

/**
 * Queue event for reliable dispatch with retry mechanism
 */
function queueEvent(
  eventName: string,
  detail: any = {},
  maxRetries: number = MAX_RETRIES,
): void {
  const queuedEvent: QueuedEvent = {
    eventName,
    detail,
    timestamp: Date.now(),
    retryCount: 0,
    maxRetries,
  };

  eventQueue.push(queuedEvent);

  // Start processing if not already running
  if (!isProcessingQueue) {
    setTimeout(processEventQueue, QUEUE_PROCESS_INTERVAL);
  }
}

/**
 * Dispatch a throttled event with retry mechanism
 */
export function dispatchThrottledEvent(
  eventName: string,
  detail: any = {},
  throttleMs: number = THROTTLE_MS,
): void {
  if (typeof window === "undefined") {
    console.warn(`[events] cannot dispatch ${eventName} - window undefined`);
    return;
  }

  const lastDispatch = lastDispatchTimes.get(eventName) || 0;
  const currentTime = Date.now();

  if (currentTime - lastDispatch < throttleMs) {
    console.log(`[events] throttling ${eventName} - too frequent`);
    return;
  }

  lastDispatchTimes.set(eventName, currentTime);
  queueEvent(eventName, detail);
}

/**
 * Dispatch kommunen focus event with robust retry mechanism
 */
export function dispatchKommunenFocus(detail: {
  center?: number[];
  extent?: number[];
  zoom?: number;
  projection?: string;
  extra?: any;
}): void {
  if (typeof window === "undefined") {
    console.warn("[events] cannot dispatch kommunen focus - window undefined");
    return;
  }

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

  // Use robust queuing system instead of simple timeout
  queueEvent("kommunen:focus", detail, MAX_RETRIES);
  console.log("[events] queued kommunen focus for reliable dispatch");
}

// Make dispatchKommunenFocus globally available for event delegation
if (typeof window !== "undefined") {
  (window as any).dispatchKommunenFocus = dispatchKommunenFocus;

  // Initialize event system on document ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      console.log("[events] DOM loaded, starting event queue processing");
      processEventQueue();
    });
  } else {
    console.log("[events] DOM already ready, starting event queue processing");
    processEventQueue();
  }
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
