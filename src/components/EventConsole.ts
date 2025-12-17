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
    source?: "main" | "editor" | string;
    windowId?: string;
    crossWindow?: boolean;
  };
}

export class EventConsole {
  private container: HTMLElement | null = null;
  private logList: HTMLElement | null = null;
  private logs: LogEntry[] = [];
  private isVisible: boolean = false;
  private maxLogs: number = 50;
  private filterTerm: string = "";
  private readonly STORAGE_KEY = "p2d2:debug:events";

  constructor() {
    this.createOverlay();
    this.initializeKeyboardShortcut();
    this.restoreStateFromLocalStorage();
    this.hide(); // Start hidden by default
  }

  private initializeKeyboardShortcut(): void {
    document.addEventListener("keydown", (e) => {
      // Ctrl+Shift+E or Cmd+Shift+E
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "E") {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  /**
   * Speichert Console-Zustand in LocalStorage.
   */
  private saveStateToLocalStorage(): void {
    try {
      localStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify({
          visible: this.isVisible,
          timestamp: Date.now(),
        }),
      );
    } catch (error) {
      console.debug("[EventConsole] Could not save state", error);
    }
  }

  /**
   * Stellt Console-Zustand aus LocalStorage wieder her.
   */
  private restoreStateFromLocalStorage(): void {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (!saved) return;

      const state = JSON.parse(saved);

      // Nur wiederherstellen, wenn nicht zu alt (24h)
      if (Date.now() - state.timestamp < 24 * 60 * 60 * 1000) {
        if (state.visible) {
          this.show();
        }
      }
    } catch (error) {
      console.debug("[EventConsole] Could not restore state", error);
    }
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

    // NEU: Legende hinzufügen
    const legend = document.createElement("div");
    legend.style.cssText = `
      font-size: 9px;
      color: #9ca3af;
      margin-top: 2px;
      display: flex;
      gap: 8px;
    `;
    legend.innerHTML = `
      <span style="color: #4ade80;">🏠 Main</span>
      <span style="color: #a78bfa;">🪟 Editor</span>
      <span style="color: #fbbf24;">⚡ Cross-Window</span>
    `;

    // Title + Legende zusammen in Container
    const titleContainer = document.createElement("div");
    titleContainer.appendChild(title);
    titleContainer.appendChild(legend);

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

    // Copy JSON button
    const exportButton = document.createElement("button");
    exportButton.textContent = "📋 Copy JSON";
    exportButton.title = "Copy all logs as JSON";
    exportButton.style.cssText = `
      padding: 4px 10px;
      background: rgba(100, 200, 255, 0.1);
      border: 1px solid #60a5fa;
      border-radius: 4px;
      color: #60a5fa;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.2s;
    `;
    exportButton.addEventListener("mouseenter", () => {
      exportButton.style.background = "rgba(100, 200, 255, 0.2)";
    });
    exportButton.addEventListener("mouseleave", () => {
      exportButton.style.background = "rgba(100, 200, 255, 0.1)";
    });
    exportButton.addEventListener("click", () => this.exportLogsAsJSON());

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
    buttonContainer.appendChild(exportButton);

    // Filter input
    const filterInput = document.createElement("input");
    filterInput.type = "text";
    filterInput.placeholder = "Filter events...";
    filterInput.style.cssText = `
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid #555;
      border-radius: 4px;
      color: #f0f0f0;
      font-size: 11px;
      width: 150px;
      margin-left: 8px;
    `;
    filterInput.addEventListener("input", (e) => {
      this.filterTerm = (e.target as HTMLInputElement).value.toLowerCase();
      this.renderFilteredLogs();
    });

    buttonContainer.appendChild(filterInput);
    buttonContainer.appendChild(closeButton);
    header.appendChild(titleContainer); // Statt: header.appendChild(title);
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

    // NEU: Source-Label mit Icon
    let sourceIcon = "📡"; // Default: allgemein
    let sourceText = "";
    let sourceColor = "#60a5fa"; // Default: blau

    if (entry.meta?.source) {
      if (entry.meta.source === "editor") {
        sourceIcon = "🪟";
        sourceText = "Editor";
        sourceColor = "#a78bfa"; // Lila für Editor
      } else if (entry.meta.source === "main") {
        sourceIcon = "🏠";
        sourceText = "Main";
        sourceColor = "#4ade80"; // Grün für Main
      } else {
        sourceIcon = "📡";
        sourceText = entry.meta.source;
        sourceColor = "#60a5fa"; // Blau für andere
      }

      // Falls Cross-Window Event, zusätzlich markieren
      if (entry.meta.crossWindow) {
        sourceText += " (cross-window)";
        sourceColor = "#fbbf24"; // Gelb für Cross-Window
      }
    }

    const sourceLabel = sourceText
      ? `<span style="color: ${sourceColor}; font-size: 10px; font-weight: bold;">${sourceIcon} ${sourceText}</span>`
      : "";

    // Create HTML content
    logElement.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
        <span style="color: ${typeColor}; font-weight: bold;">${entry.type}</span>
        <div style="display: flex; gap: 8px; align-items: center;">
          ${sourceLabel}  <!-- NEU: Source-Label hier einfügen -->
          <span style="color: #9ca3af; font-size: 11px;">${timeStr}</span>
        </div>
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
      this.renderFilteredLogs();
      this.scrollToBottom();
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
      this.renderFilteredLogs();
      this.scrollToBottom();
    }

    this.saveStateToLocalStorage();
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

    this.saveStateToLocalStorage();
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
   * Exportiert alle Logs als JSON in die Zwischenablage.
   */
  private exportLogsAsJSON(): void {
    const exportData = this.logs.map((entry) => ({
      timestamp: entry.timestamp.toISOString(),
      type: entry.type,
      detail: entry.detail,
      meta: entry.meta,
    }));

    const jsonString = JSON.stringify(exportData, null, 2);

    // In Zwischenablage kopieren
    navigator.clipboard
      .writeText(jsonString)
      .then(() => {
        // Visual Feedback
        const btn = document.querySelector(
          '[title="Copy all logs as JSON"]',
        ) as HTMLButtonElement;
        if (btn) {
          const originalText = btn.textContent;
          btn.textContent = "✅ Copied!";
          btn.style.background = "rgba(74, 222, 128, 0.2)";
          btn.style.borderColor = "#4ade80";
          btn.style.color = "#4ade80";

          setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = "rgba(100, 200, 255, 0.1)";
            btn.style.borderColor = "#60a5fa";
            btn.style.color = "#60a5fa";
          }, 2000);
        }

        console.info(
          "[EventConsole] Exported",
          exportData.length,
          "logs to clipboard",
        );
      })
      .catch((err) => {
        console.error("[EventConsole] Failed to copy to clipboard:", err);
        alert("Failed to copy logs. See console for data.");
        console.log(jsonString);
      });
  }

  /**
   * Rendert gefilterte Logs basierend auf dem Filter-Term.
   */
  private renderFilteredLogs(): void {
    if (!this.logList) return;

    this.logList.innerHTML = "";

    const filtered = this.filterTerm
      ? this.logs.filter(
          (entry) =>
            entry.type.toLowerCase().includes(this.filterTerm) ||
            JSON.stringify(entry.detail)
              .toLowerCase()
              .includes(this.filterTerm) ||
            (entry.meta?.source &&
              entry.meta.source.toLowerCase().includes(this.filterTerm)),
        )
      : this.logs;

    filtered.forEach((entry) => {
      const logElement = this.createLogElement(entry);
      this.logList!.appendChild(logElement);
    });
  }

  /**
   * Scrollt zum unteren Ende der Log-Liste.
   */
  private scrollToBottom(): void {
    if (this.logList?.parentElement) {
      this.logList.parentElement.scrollTop =
        this.logList.parentElement.scrollHeight;
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
