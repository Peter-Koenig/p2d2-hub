// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Tests für p2d2Selector/js/motion.js (Animation oder Sprung beim Fokussieren)
//
// Regeln: ohne Dauer kein Animieren (disabled), nach einem Projektionswechsel
// kein Animieren (projection-change), in gleicher Projektion nur bis
// MAX_ANIMATED_SCREENS Bildschirmbreiten (distance), sonst 300 ms (animated).
// Kein Netzwerk, keine Karte.
import { describe, it, expect } from "vitest";
import {
  MAX_ANIMATED_SCREENS,
  MOTION_REASONS,
  animationDuration,
} from "../../supplement/masterportal/addons/p2d2Selector/js/motion.js";

const SIZE = [2560, 1366];
const RES = 15.875;
/** Strecke in Karteneinheiten für n Bildschirmbreiten (längere Seite) bei RES. */
const screens = (n: number) => n * Math.max(...SIZE) * RES;
const base = { projectionChanged: false, from: [356560, 5645282], resolution: RES, size: SIZE, focusDurationMs: 300 };
const to = (dx: number, dy = 0) => [base.from[0] + dx, base.from[1] + dy];

describe("animationDuration", () => {
  it("Konstanten: drei Bildschirmbreiten, vier Gründe", () => {
    expect(MAX_ANIMATED_SCREENS).toBe(3);
    expect([...MOTION_REASONS].sort()).toEqual(["animated", "disabled", "distance", "projection-change"]);
  });

  it("Projektionswechsel: Sprung, auch bei kurzer Strecke", () => {
    expect(animationDuration({ ...base, projectionChanged: true, to: to(10) })).toEqual({ duration: 0, reason: "projection-change" });
    expect(animationDuration({ ...base, projectionChanged: true, to: to(screens(100)) })).toEqual({
      duration: 0,
      reason: "projection-change",
    });
  });

  it("gleiche Projektion, kurze Strecke: 300 ms", () => {
    expect(animationDuration({ ...base, to: to(screens(1)) })).toEqual({ duration: 300, reason: "animated" });
    expect(animationDuration({ ...base, to: base.from })).toEqual({ duration: 300, reason: "animated" });
  });

  it("gleiche Projektion, lange Strecke: Sprung", () => {
    expect(animationDuration({ ...base, to: to(screens(10)) })).toEqual({ duration: 0, reason: "distance" });
    // Diagonale zählt als Länge (Math.hypot), nicht je Achse
    const d = screens(MAX_ANIMATED_SCREENS) / Math.SQRT2 + 1;
    expect(animationDuration({ ...base, to: to(d, d) })).toEqual({ duration: 0, reason: "distance" });
  });

  it("Grenzfall genau MAX_ANIMATED_SCREENS: noch animiert; ein Pixel mehr: Sprung", () => {
    expect(animationDuration({ ...base, to: to(screens(MAX_ANIMATED_SCREENS)) })).toEqual({ duration: 300, reason: "animated" });
    expect(animationDuration({ ...base, to: to(screens(MAX_ANIMATED_SCREENS) + RES) })).toEqual({ duration: 0, reason: "distance" });
  });

  it("Bildschirmbreite ist die längere Seite (Hochformat)", () => {
    const portrait = [600, 1200];
    const d = 3 * 1200 * RES;
    expect(animationDuration({ ...base, size: portrait, to: to(0, d) })).toEqual({ duration: 300, reason: "animated" });
    expect(animationDuration({ ...base, size: portrait, to: to(0, d + RES) })).toEqual({ duration: 0, reason: "distance" });
  });

  it("Strecke in Pixeln der aktuellen Auflösung: gröbere Stufe animiert dieselbe Strecke", () => {
    const d = screens(5);
    expect(animationDuration({ ...base, to: to(d) }).reason).toBe("distance");
    expect(animationDuration({ ...base, resolution: RES * 2, to: to(d) }).reason).toBe("animated");
  });

  it("focusDurationMs 0 oder ungültig: disabled, vor allen anderen Regeln", () => {
    for (const focusDurationMs of [0, -1, NaN, undefined, "300"]) {
      expect(animationDuration({ ...base, projectionChanged: true, to: to(screens(10)), focusDurationMs } as any), String(focusDurationMs)).toEqual({
        duration: 0,
        reason: "disabled",
      });
    }
  });

  it("ohne Kartengröße, Zentrum oder Auflösung: keine Streckenregel, Animation", () => {
    for (const over of [{ size: null }, { size: [0, 0] }, { from: undefined }, { resolution: 0 }, { resolution: NaN }]) {
      expect(animationDuration({ ...base, to: to(screens(10)), ...over } as any), JSON.stringify(over)).toEqual({
        duration: 300,
        reason: "animated",
      });
    }
  });

  it("Rückgabe ist ein neues Objekt mit genau duration und reason", () => {
    const r = animationDuration({ ...base, to: to(1) });
    expect(Object.keys(r).sort()).toEqual(["duration", "reason"]);
    expect(MOTION_REASONS).toContain(r.reason);
  });
});
