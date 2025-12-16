/**
 * Event Console for debugging P2D2 events
 * Shows live event logs in a visual overlay
 */

interface LogEntry {
  id: string;
  timestamp: Date;
  type: string;
  detail: any;
  meta?: {
    retryCount?: number;
    throttled?: boolean;
    success?: boolean;
    error?: string;
  };
}

export class EventConsole {
  private container: HTMLElement | null = null;
  private logList: HTMLElement | null = null;
  private logs: LogEntry[] = [];
  private isVisible: boolean = false;
  private maxLogs: number = 50;

  constructor() {
    this.createOverlay();
    this.hide(); // Start hidden by default
  }

  private createOverlay(): void {
    // Create main container
    this.container = document.createElement("div");
    this.container.id = "p2d2-event-console";
    this.container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 400px;
      max-height: 500px;
      background: rgba(30, 30, 30, 0.9);
      color: #f0f0f0;
      border: 1px solid #555;
      border-radius: 8px;
      font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
      font-size: 12px;
      z-index: 9999;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
      transition: transform 0.3s ease, opacity 0.3s ease;
    `;

    // Create header
    const header = document.createElement("div");
    header.style.cssText = `
      padding: 12px 16px;
      background: rgba(0, 0, 0, 0.4);
      border-bottom: 1px solid #555;
      display: flex;
      justify-content: space-between;
      align-items: center;
      user-select: none;
    `;

    const title = document.createElement("div");
    title.textContent = "📡 P2D2 Event Console";
    title.style.cssText = `
      font-weight: bold;
      font-size: 13px;
      color: #4ade80;
    `;

    const buttonContainer = document.createElement("div");
    buttonContainer.style.cssText = `
      display: flex;
      gap: 8px;
    `;

    // Clear button
    const clearButton = document.createElement("button");
    clearButton.textContent = "Clear";
    clearButton.style.cssText = `
      padding: 4px 10px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid #666;
      border-radius: 4px;
      color: #ccc;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.2s;
    `;
    clearButton.addEventListener("mouseenter", () => {
      clearButton.style.background = "rgba(255, 255, 255, 0.2)";
    });
    clearButton.addEventListener("mouseleave", () => {
      clearButton.style.background = "rgba(255, 255, 255, 0.1)";
    });
    clearButton.addEventListener("click", () => this.clear());

    // Close button
    const closeButton = document.createElement("button");
    closeButton.textContent = "×";
    closeButton.title = "Hide console";
    closeButton.style.cssText = `
      padding: 2px 8px;
      background: rgba(255, 100, 100, 0.2);
      border: 1px solid #f56565;
      border-radius: 4px;
      color: #f56565;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      transition: background 0.2s;
      line-height: 1;
    `;
    closeButton.addEventListener("mouseenter", () => {
      closeButton.style.background = "rgba(255, 100, 100, 0.3)";
    });
    closeButton.addEventListener("mouseleave", () => {
      closeButton.style.background = "rgba(255, 100, 100, 0.2)";
    });
    closeButton.addEventListener("click", () => this.hide());

    // Show/Hide toggle button for when hidden
    const toggleButton = document.createElement("button");
    toggleButton.textContent = "🔍";
    toggleButton.title = "Show event console";
    toggleButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(30, 30, 30, 0.8);
      color: #4ade80;
      border: 1px solid #4ade80;
      font-size: 16px;
      cursor: pointer;
      z-index: 9998;
      display: none;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    `;
    toggleButton.addEventListener("click", () => this.show());

    // Create log list container
    const logContainer = document.createElement("div");
    logContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    `;

    this.logList = document.createElement("div");
    this.logList.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 2px;
    `;

    // Assemble elements
    buttonContainer.appendChild(clearButton);
    buttonContainer.appendChild(closeButton);
    header.appendChild(title);
    header.appendChild(buttonContainer);
    logContainer.appendChild(this.logList);

    this.container.appendChild(header);
    this.container.appendChild(logContainer);

    // Add toggle button
    document.body.appendChild(toggleButton);
    const toggleBtn = toggleButton; // Keep reference

    // Add to body
    document.body.appendChild(this.container);

    // Store toggle button reference
    (this.container as any)._toggleButton = toggleBtn;
  }

  private createLogElement(entry: LogEntry): HTMLElement {
    const logElement = document.createElement("div");
    logElement.style.cssText = `
      padding: 8px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      transition: background 0.2s;
    `;
    logElement.addEventListener("mouseenter", () => {
      logElement.style.background = "rgba(255, 255, 255, 0.05)";
    });
    logElement.addEventListener("mouseleave", () => {
      logElement.style.background = "transparent";
    });

    // Format time with milliseconds
    const hours = entry.timestamp.getHours().toString().padStart(2, "0");
    const minutes = entry.timestamp.getMinutes().toString().padStart(2, "0");
    const seconds = entry.timestamp.getSeconds().toString().padStart(2, "0");
    const milliseconds = entry.timestamp
      .getMilliseconds()
      .toString()
      .padStart(3, "0");
    const timeStr = `${hours}:${minutes}:${seconds}.${milliseconds}`;

    // Format type with color based on event
    let typeColor = "#60a5fa"; // default blue
    if (entry.meta?.error)
      typeColor = "#f87171"; // red for errors
    else if (entry.meta?.throttled)
      typeColor = "#fbbf24"; // yellow for throttled
    else if (entry.type.includes("focus")) typeColor = "#4ade80"; // green for focus events

    // Create HTML content
    logElement.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="color: ${typeColor}; font-weight: bold;">${entry.type}</span>
        <span style="color: #9ca3af; font-size: 11px;">${timeStr}</span>
      </div>
      ${
        entry.meta
          ? `
        <div style="display: flex; gap: 8px; margin-bottom: 4px; font-size: 11px;">
          ${entry.meta.retryCount !== undefined ? `<span style="color: #fbbf24;">retry: ${entry.meta.retryCount}</span>` : ""}
          ${entry.meta.throttled ? `<span style="color: #fbbf24;">throttled</span>` : ""}
          ${entry.meta.success !== undefined ? `<span style="color: ${entry.meta.success ? "#4ade80" : "#f87171"}">${entry.meta.success ? "success" : "failed"}</span>` : ""}
          ${entry.meta.error ? `<span style="color: #f87171;">error: ${entry.meta.error}</span>` : ""}
        </div>
      `
          : ""
      }
      <div style="color: #d1d5db; font-size: 11px; overflow: hidden; text-overflow: ellipsis; max-height: 60px; overflow-y: auto;">
        ${this.formatDetail(entry.detail)}
      </div>
    `;

    // Add click to expand detail
    logElement.style.cursor = "pointer";
    logElement.addEventListener("click", () => {
      const detailEl = logElement.querySelector(
        "div:last-child",
      ) as HTMLElement;
      if (detailEl.style.maxHeight === "none") {
        detailEl.style.maxHeight = "60px";
      } else {
        detailEl.style.maxHeight = "none";
      }
    });

    return logElement;
  }

  private formatDetail(detail: any): string {
    if (!detail) return "No detail";

    try {
      if (typeof detail === "object") {
        // Handle specific detail types
        if (detail.center || detail.extent || detail.slug) {
          const parts: string[] = [];
          if (detail.slug) parts.push(`slug: ${detail.slug}`);
          if (detail.wp_name) parts.push(`name: ${detail.wp_name}`);
          if (detail.center)
            parts.push(
              `center: [${detail.center[0]?.toFixed(4)}, ${detail.center[1]?.toFixed(4)}]`,
            );
          if (detail.extent)
            parts.push(
              `extent: [${detail.extent.map((n: number) => n?.toFixed(4)).join(", ")}]`,
            );
          if (detail.zoom) parts.push(`zoom: ${detail.zoom}`);
          if (detail.projection) parts.push(`proj: ${detail.projection}`);
          return parts.join(" | ");
        }
        return JSON.stringify(detail, null, 2);
      }
      return String(detail);
    } catch {
      return "[Unserializable data]";
    }
  }

  /**
   * Log an event to the console
   */
  public logEvent(type: string, detail: any, meta?: LogEntry["meta"]): void {
    const entry: LogEntry = {
      id: Date.now() + "-" + Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      type,
      detail,
      meta,
    };

    this.logs.push(entry);

    // Limit logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
      if (this.logList && this.logList.firstChild) {
        this.logList.removeChild(this.logList.firstChild);
      }
    }

    // Add to DOM if visible
    if (this.logList && this.isVisible) {
      const logElement = this.createLogElement(entry);
      this.logList.appendChild(logElement);

      // Auto-scroll to bottom
      this.logList.parentElement?.scrollTo({
        top: this.logList.parentElement.scrollHeight,
        behavior: "smooth",
      });
    }
  }

  /**
   * Clear all logs
   */
  public clear(): void {
    this.logs = [];
    if (this.logList) {
      this.logList.innerHTML = "";
    }
  }

  /**
   * Show the console
   */
  public show(): void {
    if (!this.container) return;

    this.isVisible = true;
    this.container.style.transform = "translateY(0)";
    this.container.style.opacity = "1";
    this.container.style.display = "flex";

    // Hide toggle button
    const toggleBtn = (this.container as any)._toggleButton;
    if (toggleBtn) {
      toggleBtn.style.display = "none";
    }

    // Re-populate logs if needed
    if (this.logList && this.logs.length > 0) {
      this.logList.innerHTML = "";
      this.logs.forEach((entry) => {
        this.logList!.appendChild(this.createLogElement(entry));
      });

      // Scroll to bottom
      setTimeout(() => {
        if (this.logList?.parentElement) {
          this.logList.parentElement.scrollTop =
            this.logList.parentElement.scrollHeight;
        }
      }, 10);
    }
  }

  /**
   * Hide the console
   */
  public hide(): void {
    if (!this.container) return;

    this.isVisible = false;
    this.container.style.transform = "translateY(20px)";
    this.container.style.opacity = "0";
    setTimeout(() => {
      if (this.container && !this.isVisible) {
        this.container.style.display = "none";
      }
    }, 300);

    // Show toggle button
    const toggleBtn = (this.container as any)._toggleButton;
    if (toggleBtn) {
      toggleBtn.style.display = "flex";
    }
  }

  /**
   * Toggle console visibility
   */
  public toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Check if console is visible
   */
  public isConsoleVisible(): boolean {
    return this.isVisible;
  }
}

// Global access for debugging
declare global {
  interface Window {
    __P2D2_EVENT_CONSOLE__?: EventConsole;
  }
}
