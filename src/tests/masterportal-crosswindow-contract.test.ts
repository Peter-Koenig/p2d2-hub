// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Protokoll-Vertragstest Cross-Window-Events ↔ Masterportal-Add-on
//
// Das Masterportal-Add-on p2d2FeatureEditor öffnet den Astro-Editor mit
// window.open, ohne noopener. Der Editor sendet dann Ereignisse per
// window.opener.postMessage an das Masterportal (src/utils/cross-window-events.ts).
// Das Add-on hat keinen Empfänger. Schlägt ein Test hier fehl, wurde das
// Protokoll geändert und das Add-on (und ein späterer Empfänger) ist zu prüfen.
// Liest die Quellen nur als Text. Kein Netzwerk, keine DB.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const crossWindow = read("src/utils/cross-window-events.ts");
const events = read("src/utils/events.ts");

// Argumente des postMessage-Aufrufs an window.opener.
const postMessageCall =
  crossWindow.match(/window\.opener\.postMessage\(\s*\{([\s\S]*?)\}\s*,\s*([^)]*?)\s*,?\s*\)/) ??
  null;

describe("Cross-Window-Protokoll (Editor → Hauptfenster)", () => {
  it("Nachrichtentyp p2d2:cross-window-event", () => {
    expect(crossWindow).toContain('"p2d2:cross-window-event"');
    expect(postMessageCall, "window.opener.postMessage({...}, …)").not.toBeNull();
    expect(postMessageCall![1]).toMatch(/type:\s*"p2d2:cross-window-event"/);
  });

  it("Nachrichtenfelder im postMessage-Aufruf", () => {
    const body = postMessageCall![1];
    for (const field of ["type", "eventType", "detail", "source", "windowId", "timestamp"]) {
      expect(body, field).toMatch(new RegExp(`(^|[\\s,{])${field}\\s*[:,\\n]`));
    }
  });

  it("Ziel ist window.location.origin (Masterportal und Editor brauchen dieselbe Origin)", () => {
    // Masterportal (/masterportal/) und Editor (/feature-editor/…) müssen unter
    // derselben Origin laufen, sonst verwirft der Browser die Nachricht.
    const target = postMessageCall![2]
      .replace(/\/\/.*$/gm, "")
      .replace(/,\s*$/, "")
      .trim();
    expect(target).toBe("window.location.origin");
  });

  it("isMainWindow ist !window.opener", () => {
    expect(crossWindow).toMatch(
      /function isMainWindow\(\)[^{]*\{\s*return !window\.opener;\s*\}/,
    );
  });

  it("Editor-Ereignisse stehen im Enum P2D2EventType", () => {
    const enumBody = events.match(/export enum P2D2EventType \{([\s\S]*?)\}/)?.[1] ?? "";
    for (const name of [
      "p2d2:editor:ready",
      "p2d2:editor:feature:selected",
      "p2d2:editor:feature:deselected",
      "p2d2:editor:tool:switch",
      "p2d2:editor:mode:change",
      "p2d2:editor:save:start",
      "p2d2:editor:save:complete",
      "p2d2:editor:save:error",
    ]) {
      expect(enumBody, name).toContain(`"${name}"`);
    }
  });
});
