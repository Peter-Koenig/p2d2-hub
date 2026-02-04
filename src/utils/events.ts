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

// Event type definitions
export enum P2D2EventType {
  KOMMUNEN_FOCUS = "p2d2:kommunen:focus",
  KOMMUNEN_SELECTED = "p2d2:kommunen:selected",
  MAP_READY = "p2d2:map:ready",
  MAP_MOVEEND = "p2d2:map:moveend",
  MAP_ZOOMEND = "p2d2:map:zoomend",
  MAP_CLICK = "p2d2:map:click",
  LAYER_TOGGLE = "p2d2:layer:toggle",
  LAYER_VISIBILITY_CHANGE = "p2d2:layer:visibility:change",
  WFS_LOAD_START = "p2d2:wfs:load:start",
  WFS_LOAD_COMPLETE = "p2d2:wfs:load:complete",
  WFS_LOAD_ERROR = "p2d2:wfs:load:error",
  WFS_FEATURE_CREATED = "p2d2:wfs:feature:created",
  WFS_FEATURE_UPDATED = "p2d2:wfs:feature:updated",
  WFS_FEATURE_DELETED = "p2d2:wfs:feature:deleted",
  EDITOR_READY = "p2d2:editor:ready",
  EDITOR_FEATURE_MODIFIED = "p2d2:editor:feature:modified",
  EDITOR_TOOL_SWITCH = "p2d2:editor:tool:switch",
  EDITOR_MODE_CHANGE = "p2d2:editor:mode:change",
  EDITOR_FEATURE_SELECTED = "p2d2:editor:feature:selected",
  EDITOR_FEATURE_DESELECTED = "p2d2:editor:feature:deselected",
  EDITOR_SAVE_START = "p2d2:editor:save:start",
  EDITOR_SAVE_COMPLETE = "p2d2:editor:save:complete",
  EDITOR_SAVE_ERROR = "p2d2:editor:save:error",
  CRS_CHANGE = "p2d2:crs:change",
  UI_PANEL_TOGGLE = "p2d2:ui:panel:toggle",
}

export interface P2D2EventMap {
  [P2D2EventType.KOMMUNEN_FOCUS]: KommunenFocusDetail;
  [P2D2EventType.KOMMUNEN_SELECTED]: KommunenSelectedDetail;
  [P2D2EventType.MAP_READY]: MapReadyDetail;
  [P2D2EventType.MAP_MOVEEND]: MapMoveEndDetail;
  [P2D2EventType.MAP_ZOOMEND]: MapZoomEndDetail;
  [P2D2EventType.MAP_CLICK]: MapClickDetail;
  [P2D2EventType.LAYER_TOGGLE]: LayerToggleDetail;
  [P2D2EventType.LAYER_VISIBILITY_CHANGE]: LayerVisibilityChangeDetail;
  [P2D2EventType.WFS_LOAD_START]: WFSLoadStartDetail;
  [P2D2EventType.WFS_LOAD_COMPLETE]: WFSLoadCompleteDetail;
  [P2D2EventType.WFS_LOAD_ERROR]: WFSLoadErrorDetail;
  [P2D2EventType.WFS_FEATURE_CREATED]: WFSFeatureCreatedDetail;
  [P2D2EventType.WFS_FEATURE_UPDATED]: WFSFeatureUpdatedDetail;
  [P2D2EventType.WFS_FEATURE_DELETED]: WFSFeatureDeletedDetail;
  [P2D2EventType.EDITOR_READY]: EditorReadyDetail;
  [P2D2EventType.EDITOR_FEATURE_MODIFIED]: EditorFeatureModifiedDetail;
  [P2D2EventType.EDITOR_TOOL_SWITCH]: EditorToolSwitchDetail;
  [P2D2EventType.EDITOR_MODE_CHANGE]: EditorModeChangeDetail;
  [P2D2EventType.EDITOR_FEATURE_SELECTED]: EditorFeatureSelectedDetail;
  [P2D2EventType.EDITOR_SAVE_START]: EditorSaveStartDetail;
  [P2D2EventType.EDITOR_SAVE_COMPLETE]: EditorSaveCompleteDetail;
  [P2D2EventType.EDITOR_SAVE_ERROR]: EditorSaveErrorDetail;
  [P2D2EventType.CRS_CHANGE]: CRSChangeDetail;
  [P2D2EventType.UI_PANEL_TOGGLE]: UIPanelToggleDetail;
}

export const EVENT_KOMMUNEN_FOCUS = P2D2EventType.KOMMUNEN_FOCUS;

/**
 * Log event to EventConsole if available
 */
export function logToEventConsole(
  eventName: string,
  detail: any,
  meta?: {
    retryCount?: number;
    throttled?: boolean;
    success?: boolean;
    error?: string;
  },
): void {
  // Check if EventConsole is available
  if (typeof window !== "undefined" && (window as any).__P2D2_EVENT_CONSOLE__) {
    try {
      (window as any).__P2D2_EVENT_CONSOLE__.logEvent(eventName, detail, meta);
    } catch (error) {
      // Silently fail - this is debug functionality only
      console.debug("[events] Failed to log to EventConsole:", error);
    }
  }
}

// Interface für Kommunen Focus Event Detail
export interface KommunenFocusDetail {
  center?: [number, number];
  extent?: [number, number, number, number];
  zoom?: number;
  projection?: string;
  extra?: any;
  slug?: string;
  wpName?: string;
  osmAdminLevels?: number[];
}

export interface MapReadyDetail {
  mapId?: string;
  view?: any;
  projection?: string;
  timestamp: number;
}

export interface LayerToggleDetail {
  layerName: string;
  visible: boolean;
  layerType?: string;
}

export interface WFSLoadStartDetail {
  layerName: string;
  kommuneSlug?: string;
  categorySlug?: string;
  timestamp: number;
}

export interface WFSLoadCompleteDetail {
  layerName: string;
  kommuneSlug?: string;
  categorySlug?: string;
  featureCount: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

export interface WFSLoadErrorDetail {
  layerName: string;
  kommuneSlug?: string;
  categorySlug?: string;
  error: string;
  timestamp: number;
}

export interface KommunenSelectedDetail {
  slug: string;
  wpName: string;
  osmAdminLevels?: number[];
  timestamp: number;
}

export interface MapMoveEndDetail {
  center: [number, number];
  zoom: number;
  extent: [number, number, number, number];
  projection: string;
  timestamp: number;
}

export interface MapZoomEndDetail {
  zoom: number;
  previousZoom: number;
  center: [number, number];
  timestamp: number;
}

export interface MapClickDetail {
  coordinate: [number, number];
  pixel: [number, number];
  projection: string;
  timestamp: number;
}

export interface LayerVisibilityChangeDetail {
  layerName: string;
  visible: boolean;
  layerType: string;
  timestamp: number;
}

export interface WFSFeatureCreatedDetail {
  featureId: string;
  layerName: string;
  geometry: any;
  properties: Record<string, any>;
  timestamp: number;
}

export interface WFSFeatureUpdatedDetail {
  featureId: string;
  layerName: string;
  geometry: any;
  properties: Record<string, any>;
  previousProperties?: Record<string, any>;
  timestamp: number;
}

export interface WFSFeatureDeletedDetail {
  featureId: string;
  layerName: string;
  timestamp: number;
}

export interface EditorReadyDetail {
  windowId: string;
  containerType: string;
  wpName: string;
  timestamp: number;
}

export interface EditorFeatureModifiedDetail {
  featureId: string;
  tool: "modify" | "rotate" | "translate";
  windowId: string;
  geometry: any;
  timestamp: number;
}

export interface EditorToolSwitchDetail {
  tool: string;
  previousTool: string;
  windowId: string;
  timestamp: number;
}

export interface EditorModeChangeDetail {
  mode: "navigate" | "edit";
  previousMode: "navigate" | "edit";
  windowId: string;
  timestamp: number;
}

export interface EditorFeatureSelectedDetail {
  featureId: string;
  geometry: any;
  properties: Record<string, any>;
  windowId: string;
  timestamp: number;
}

export interface EditorSaveStartDetail {
  featureId: string;
  windowId: string;
  timestamp: number;
}

export interface EditorSaveCompleteDetail {
  featureId: string;
  windowId: string;
  success: boolean;
  timestamp: number;
}

export interface EditorSaveErrorDetail {
  featureId: string;
  windowId: string;
  error: string;
  timestamp: number;
}

export interface CRSChangeDetail {
  previousCRS: string;
  newCRS: string;
  timestamp: number;
}

export interface UIPanelToggleDetail {
  panelId: string;
  visible: boolean;
  timestamp: number;
}

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

  // Prevent recursive calls
  if ((window as any).__p2d2ProcessingQueue) return;
  (window as any).__p2d2ProcessingQueue = true;

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

        // Log to EventConsole if available
        logToEventConsole(queuedEvent.eventName, queuedEvent.detail, {
          retryCount: queuedEvent.retryCount,
          success: true,
        });
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

          // Log to EventConsole if available
          logToEventConsole(queuedEvent.eventName, queuedEvent.detail, {
            retryCount: queuedEvent.retryCount,
            success: false,
            error: "Max retries exceeded",
          });
        }
      }
    } catch (error) {
      console.error(
        `[events] error dispatching ${queuedEvent.eventName}:`,
        error,
      );

      // Log to EventConsole if available
      logToEventConsole(queuedEvent.eventName, queuedEvent.detail, {
        retryCount: queuedEvent.retryCount,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

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
  (window as any).__p2d2ProcessingQueue = false;

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

    // Log throttled event to EventConsole if available
    logToEventConsole(eventName, detail, {
      throttled: true,
    });
    return;
  }

  lastDispatchTimes.set(eventName, currentTime);
  queueEvent(eventName, detail);
}

/**
 * Dispatch kommunen focus event with robust retry mechanism
 */
export function dispatchKommunenFocus(detail: KommunenFocusDetail): void {
  if (typeof window === "undefined") {
    console.warn("[events] cannot dispatch kommunen focus - window undefined");
    return;
  }

  // Validate data before dispatch
  const hasValidCenter = isValidWgs84Coordinate(detail.center);
  const hasValidExtent = isValidWgs84Extent(detail.extent);

  if (!hasValidCenter && !hasValidExtent) {
    console.warn(
      "[events] skipping kommunen focus - no valid center or extent data",
      detail,
    );
    return;
  }

  // Use type-safe event dispatching
  dispatchP2D2Event(P2D2EventType.KOMMUNEN_FOCUS, detail);
}

function isValidWgs84Coordinate(coord: any): coord is [number, number] {
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

function isValidWgs84Extent(
  extent: any,
): extent is [number, number, number, number] {
  return (
    Array.isArray(extent) &&
    extent.length === 4 &&
    extent.every(Number.isFinite) &&
    extent[0] >= -180 &&
    extent[2] <= 180 &&
    extent[1] >= -90 &&
    extent[3] <= 90
  );
}

// Make dispatchKommunenFocus globally available for event delegation
if (typeof window !== "undefined") {
  (window as any).dispatchKommunenFocus = dispatchKommunenFocus;
  (window as any).dispatchThrottledEvent = dispatchThrottledEvent;

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

  // Create unique handler key for HMR deduplication
  const handlerKey = `__${eventName}_handler_${Date.now()}__`;

  // Check if handler already exists and remove it
  const existingHandler = (window as any)[handlerKey];
  if (existingHandler) {
    window.removeEventListener(eventName, existingHandler, options);
  }

  // Store handler reference and add listener
  (window as any)[handlerKey] = handler;
  window.addEventListener(eventName, handler, options);
}

/**
 * Type-safe event dispatcher
 */
export function dispatchP2D2Event<T extends P2D2EventType>(
  eventType: T,
  detail: P2D2EventMap[T],
  options?: { throttleMs?: number },
): void {
  const throttleMs = options?.throttleMs ?? THROTTLE_MS;
  dispatchThrottledEvent(eventType, detail, throttleMs);
}

/**
 * Type-safe event listener
 */
export function addP2D2EventListener<T extends P2D2EventType>(
  eventType: T,
  handler: (event: CustomEvent<P2D2EventMap[T]>) => void,
  options?: AddEventListenerOptions,
): void {
  addEventListener(eventType, handler as (event: any) => void, options);
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
