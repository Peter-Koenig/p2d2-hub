// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Tests für die Store-Aktionen des Add-ons p2d2Selector
//
// Ohne Masterportal und ohne Vuex: ein kleiner Kontext wendet die echten
// Mutationen auf den echten Anfangszustand an. fetch ist ein Fake.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createActions } from "../../supplement/masterportal/addons/p2d2Selector/store/actionsP2d2Selector.js";
import mutations from "../../supplement/masterportal/addons/p2d2Selector/store/mutationsP2d2Selector.js";
import baseState from "../../supplement/masterportal/addons/p2d2Selector/store/stateP2d2Selector.js";
import getters from "../../supplement/masterportal/addons/p2d2Selector/store/gettersP2d2Selector.js";

const FILE = resolve(__dirname, "../../supplement/masterportal/portal/resources/p2d2-selection.json");
const real = (): any => JSON.parse(readFileSync(FILE, "utf8"));
const URL_ = "./resources/p2d2-selection.json";

const makeContext = () => {
  const state: any = { ...baseState };
  const commit = (type: string, payload: unknown) => (mutations as any)[type](state, payload);
  return { state, commit };
};
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe("loadSelection", () => {
  it("200 gültig: ready, Auswahl im State, Abruf mit Pfad und no-cache", async () => {
    const fetch = vi.fn(async () => ok(real()));
    const ctx = makeContext();
    await createActions({ url: URL_, fetch }).loadSelection(ctx);
    expect(fetch).toHaveBeenCalledWith(URL_, { cache: "no-cache" });
    expect(ctx.state.loadStatus).toBe("ready");
    expect(ctx.state.lastError).toBeNull();
    expect(ctx.state.selection.kommunen).toHaveLength(11);
  });

  it("200 ungültig: error mit Meldung, keine Auswahl, kein Wurf", async () => {
    const ctx = makeContext();
    await createActions({ url: URL_, fetch: async () => ok({ version: 9 }) }).loadSelection(ctx);
    expect(ctx.state.loadStatus).toBe("error");
    expect(ctx.state.lastError).toMatch(/ungültig.*version/);
    expect(ctx.state.selection).toBeNull();
  });

  it("404: error mit Statuscode, .json() wird nicht aufgerufen", async () => {
    const json = vi.fn();
    const ctx = makeContext();
    await createActions({ url: URL_, fetch: async () => ({ ok: false, status: 404, json }) }).loadSelection(ctx);
    expect(json).not.toHaveBeenCalled();
    expect(ctx.state.loadStatus).toBe("error");
    expect(ctx.state.lastError).toMatch(/HTTP 404/);
  });

  it("Netzwerkfehler: error mit Meldung", async () => {
    const ctx = makeContext();
    await createActions({
      url: URL_,
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    }).loadSelection(ctx);
    expect(ctx.state.loadStatus).toBe("error");
    expect(ctx.state.lastError).toBe("Failed to fetch");
  });

  it("Rumpf kein JSON: error", async () => {
    const ctx = makeContext();
    await createActions({
      url: URL_,
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }),
    }).loadSelection(ctx);
    expect(ctx.state.loadStatus).toBe("error");
    expect(ctx.state.lastError).toMatch(/Unexpected token/);
  });

  it("erneutes Laden nach Fehler setzt die Meldung zurück", async () => {
    const ctx = makeContext();
    let fail = true;
    const actions = createActions({ url: URL_, fetch: async () => (fail ? { ok: false, status: 500, json: vi.fn() } : ok(real())) });
    await actions.loadSelection(ctx);
    expect(ctx.state.loadStatus).toBe("error");
    fail = false;
    await actions.loadSelection(ctx);
    expect(ctx.state.loadStatus).toBe("ready");
    expect(ctx.state.lastError).toBeNull();
  });
});

describe("select", () => {
  // select löst die Aktion applySelection aus (Karte, Layer, Zoom; siehe
  // masterportal-selector-actions.test.ts); hier nur der Aufruf.
  const loaded = async () => {
    const ctx: any = makeContext();
    const actions = createActions({ url: URL_, fetch: async () => ok(real()) });
    await actions.loadSelection(ctx);
    ctx.dispatch = vi.fn(() => Promise.resolve());
    return { ctx, actions };
  };

  it("löst applySelection mit Slugs und Einträgen aus", async () => {
    const { ctx, actions } = await loaded();
    const k = ctx.state.selection.kommunen[0];
    const c = ctx.state.selection.kategorien[0];
    actions.select(ctx, { kommuneSlug: k.slug });
    actions.select(ctx, { kategorieSlug: c.slug });
    expect(ctx.dispatch).toHaveBeenCalledTimes(2);
    expect(ctx.dispatch.mock.calls[0]).toEqual([
      "applySelection",
      { kommuneSlug: k.slug, kategorieSlug: null, kommune: k, kategorie: null },
    ]);
    expect(ctx.dispatch.mock.calls[1][1]).toMatchObject({ kommuneSlug: k.slug, kategorieSlug: c.slug, kommune: k, kategorie: c });
    expect((getters as any).signature(ctx.state)).toBe(`${k.slug}|${c.slug}`);
  });

  it("zweiter Klick hebt auf, applySelection bekommt die leere Auswahl", async () => {
    const { ctx, actions } = await loaded();
    const slug = ctx.state.selection.kommunen[0].slug;
    actions.select(ctx, { kommuneSlug: slug });
    actions.select(ctx, { kommuneSlug: slug });
    expect(ctx.state.kommuneSlug).toBeNull();
    expect(ctx.dispatch.mock.calls[1][1]).toEqual({ kommuneSlug: null, kategorieSlug: null, kommune: null, kategorie: null });
  });

  it("unbekannter Slug: kein applySelection, State unverändert", async () => {
    const { ctx, actions } = await loaded();
    actions.select(ctx, { kommuneSlug: "gibt-es-nicht" });
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(ctx.state.kommuneSlug).toBeNull();
  });

  it("ohne geladene Auswahl passiert nichts", () => {
    const ctx: any = { ...makeContext(), dispatch: vi.fn() };
    createActions({ url: URL_, fetch: vi.fn() }).select(ctx, { kommuneSlug: "x" });
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });

  it("Getter der gewählten Einträge", async () => {
    const { ctx, actions } = await loaded();
    const slug = ctx.state.selection.kommunen[0].slug;
    actions.select(ctx, { kommuneSlug: slug });
    expect(ctx.state.kommuneSlug).toBe(slug);
    expect((getters as any).selectedKommune(ctx.state).slug).toBe(slug);
  });
});
