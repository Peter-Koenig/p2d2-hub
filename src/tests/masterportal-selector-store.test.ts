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
  const loaded = async (applySelection?: any) => {
    const ctx = makeContext();
    const actions = createActions({ url: URL_, fetch: async () => ok(real()), ...(applySelection ? { applySelection } : {}) });
    await actions.loadSelection(ctx);
    return { ctx, actions };
  };

  it("ruft den Hook mit der Signatur und den Einträgen", async () => {
    const hook = vi.fn();
    const { ctx, actions } = await loaded(hook);
    const k = ctx.state.selection.kommunen[0];
    const c = ctx.state.selection.kategorien[0];
    actions.select(ctx, { kommuneSlug: k.slug });
    actions.select(ctx, { kategorieSlug: c.slug });
    expect(hook).toHaveBeenCalledTimes(2);
    expect(hook.mock.calls[0][0]).toBe(`${k.slug}|`);
    expect(hook.mock.calls[1][0]).toBe(`${k.slug}|${c.slug}`);
    expect(hook.mock.calls[1][1]).toMatchObject({ kommuneSlug: k.slug, kategorieSlug: c.slug, kommune: k, kategorie: c });
    expect((getters as any).signature(ctx.state)).toBe(`${k.slug}|${c.slug}`);
  });

  it("zweiter Klick hebt auf, Hook bekommt die leere Signatur", async () => {
    const hook = vi.fn();
    const { ctx, actions } = await loaded(hook);
    const slug = ctx.state.selection.kommunen[0].slug;
    actions.select(ctx, { kommuneSlug: slug });
    actions.select(ctx, { kommuneSlug: slug });
    expect(ctx.state.kommuneSlug).toBeNull();
    expect(hook.mock.calls[1][0]).toBe("");
  });

  it("unbekannter Slug: kein Hook-Aufruf, State unverändert", async () => {
    const hook = vi.fn();
    const { ctx, actions } = await loaded(hook);
    actions.select(ctx, { kommuneSlug: "gibt-es-nicht" });
    expect(hook).not.toHaveBeenCalled();
    expect(ctx.state.kommuneSlug).toBeNull();
  });

  it("ohne geladene Auswahl passiert nichts", () => {
    const hook = vi.fn();
    const ctx = makeContext();
    createActions({ url: URL_, fetch: vi.fn(), applySelection: hook }).select(ctx, { kommuneSlug: "x" });
    expect(hook).not.toHaveBeenCalled();
  });

  it("ohne Hook kein Fehler", async () => {
    const { ctx, actions } = await loaded();
    const slug = ctx.state.selection.kommunen[0].slug;
    expect(() => actions.select(ctx, { kommuneSlug: slug })).not.toThrow();
    expect(ctx.state.kommuneSlug).toBe(slug);
    expect((getters as any).selectedKommune(ctx.state).slug).toBe(slug);
  });
});
