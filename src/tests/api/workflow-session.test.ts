// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: Vitest-Integrationstests für den Workflow-Session-Endpunkt
//
// Voraussetzungen:
//   - Astro-Dev-Server läuft unter http://localhost:4321 (npm run dev:de1)
//   - .env.test existiert im Projekt-Root mit:
//       TEST_SESSION_COOKIE=<Zitadel-Cookie von test@data-dna.eu (Rolle editor)>
//       TEST_SESSION_COOKIE_NOEDIT=<Zitadel-Cookie von noeditor@data-dna.eu (kein editor)>
//       DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD (identisch zu .env.de1)
//
// .env.test wird automatisch geladen (src/tests/setup.ts → dotenv).
//
// Start:  npx vitest run
// Watch:  npx vitest

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import postgres from "postgres";

// ---------------------------------------------------------------------------
// Test-Konstanten
// ---------------------------------------------------------------------------

const BASE_URL = "http://localhost:4321";
const API_PATH = "/api/workflow/session";
const SCHEMA = "p2d2_de1";
const FEATURE_TYPE = "grabflur";
const FEATURE_UUID = "699ab5c8-526f-46d4-a28b-dd524758e48d";
const FEATURE_SET_ID = "fh33-vitest";
const TEST_USER = "test@data-dna.eu";

// ---------------------------------------------------------------------------
// Module-level state (lebt über describe-Blöcke hinweg)
// ---------------------------------------------------------------------------

let sessionCookie = "";
let sessionCookieNoEdit = "";
let sql: postgres.Sql<{}>;

// ---------------------------------------------------------------------------
// Gültiger POST-Body für alle Tests
// ---------------------------------------------------------------------------

const validBody = {
  feature_type: FEATURE_TYPE,
  feature_uuid: FEATURE_UUID,
  feature_set_id: FEATURE_SET_ID,
  context: { key: "fhnr", label: "Friedhof Deutz (Vitest)", value: "33" },
  wpname: "de-Koeln",
  municipality: "koeln",
  edit_comment: "Vitest-Integrationstest",
};

// ---------------------------------------------------------------------------
// Helper: HTTP-Requests
// ---------------------------------------------------------------------------

async function postSession(
  body: Record<string, unknown>,
  cookie?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookie) headers["Cookie"] = cookie;
  return fetch(`${BASE_URL}${API_PATH}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function patchSession(
  id: number,
  body: Record<string, unknown>,
  cookie?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookie) headers["Cookie"] = cookie;
  return fetch(`${BASE_URL}${API_PATH}/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Helper: DB-Operationen
// ---------------------------------------------------------------------------

/**
 * Legt eine Testversion (version_nr=1) in der Versionentabelle an.
 * Simuliert den WFS-T-Insert, den der Browser im Editor-Workflow ausfuehrt.
 */
async function createTestVersion(sessionId: number): Promise<string> {
  const [row] = await sql`
    INSERT INTO ${sql(SCHEMA)}.${sql("p2d2_grabflure_versionen")} (
      grabflur_id, version_nr, session_id, is_session_boundary,
      created_by, edit_comment, geom
    ) VALUES (
      ${FEATURE_UUID}, 1, ${sessionId}, true,
      ${TEST_USER}, 'Testversion (Vitest)',
      ST_SetSRID(ST_GeomFromText('MULTIPOLYGON(((6.989 50.922, 6.990 50.922, 6.990 50.923, 6.989 50.923, 6.989 50.922)))'), 4326)
    )
    RETURNING version_id
  `;
  return row.version_id as string;
}

/**
 * Setzt den State einer Session per Direkt-SQL.
 * Wird fuer Test 8 benoetigt (SESSION_NOT_ACTIVE).
 */
async function setSessionState(
  sessionId: number,
  state: string,
): Promise<void> {
  await sql`
    UPDATE ${sql(SCHEMA)}.${sql("wf_sessions")}
    SET state = ${state}
    WHERE id = ${sessionId}
  `;
}

/**
 * Bereinigt saemtliche Testdaten fuer FEATURE_SET_ID.
 * Kein Filter auf started_by: Die tatsaechliche User-Email kommt aus dem
 * Zitadel-Session-Cookie und darf fuer die Testbereinigung keine Rolle spielen.
 */
async function cleanupTestData(): Promise<void> {
  const sessions = await sql`
    SELECT id FROM ${sql(SCHEMA)}.${sql("wf_sessions")}
    WHERE feature_type = ${FEATURE_TYPE}
      AND feature_set_id = ${FEATURE_SET_ID}
  `;
  if (sessions.length === 0) return;

  const ids: number[] = sessions.map((s) =>
    Number((s as Record<string, unknown>).id),
  );

  // 1. wf_protokoll (FK auf session_id)
  await sql`
    DELETE FROM ${sql(SCHEMA)}.${sql("wf_protokoll")}
    WHERE session_id = ANY(${ids})
  `;

  // 2. wf_feature_status (FK auf last_session_id)
  await sql`
    DELETE FROM ${sql(SCHEMA)}.${sql("wf_feature_status")}
    WHERE last_session_id = ANY(${ids})
  `;

  // 3. p2d2_grabflure_versionen (FK auf session_id oder grabflur_id)
  await sql`
    DELETE FROM ${sql(SCHEMA)}.${sql("p2d2_grabflure_versionen")}
    WHERE session_id = ANY(${ids})
       OR (grabflur_id = ${FEATURE_UUID} AND version_nr = 0)
  `;

  // 4. wf_sessions (CASCADE: wf_snapshots, p2d2_grabflure_snapshots)
  await sql`
    DELETE FROM ${sql(SCHEMA)}.${sql("wf_sessions")}
    WHERE id = ANY(${ids})
  `;
}

// ===========================================================================
// Setup / Teardown
// ===========================================================================

beforeAll(async () => {
  // Auth-Cookies aus .env.test (geladen via src/tests/setup.ts)
  sessionCookie = process.env.TEST_SESSION_COOKIE ?? "";
  sessionCookieNoEdit = process.env.TEST_SESSION_COOKIE_NOEDIT ?? "";

  if (!sessionCookie) {
    console.warn(
      "[WARN] TEST_SESSION_COOKIE nicht gesetzt – Auth-Tests schlagen fehl",
    );
  }
  if (!sessionCookieNoEdit) {
    console.warn(
      "[WARN] TEST_SESSION_COOKIE_NOEDIT nicht gesetzt – 403-Tests schlagen fehl",
    );
  }

  // DB-Verbindung fuer Testdaten-Management
  const dbUrl = `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;
  sql = postgres(dbUrl, { max: 2, idle_timeout: 10 });
});

afterAll(async () => {
  await cleanupTestData();
  if (sql) await sql.end();
});

// ===========================================================================
// POST /api/workflow/session – Fehlerfaelle
// ===========================================================================

describe("POST /api/workflow/session – Fehlerfaelle", () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  // -----------------------------------------------------------------------
  // Test 1: 401 – kein Cookie
  // -----------------------------------------------------------------------
  it("1. 401 – kein Cookie", async () => {
    const resp = await fetch(`${BASE_URL}${API_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body).toHaveProperty("error", "UNAUTHORIZED");
  });

  // -----------------------------------------------------------------------
  // Test 2: 403 – Cookie gueltig, kein openSession-Recht
  // -----------------------------------------------------------------------
  it("2. 403 – Cookie ohne openSession-Recht", async () => {
    // Voraussetzung: TEST_SESSION_COOKIE_NOEDIT ist ein gueltiger Cookie
    // eines Zitadel-Users OHNE 'verwaltung'-Rolle (daher kein openSession-Recht)
    if (!sessionCookieNoEdit) return; // skip if no test cookie

    const resp = await postSession(validBody, sessionCookieNoEdit);

    expect(resp.status).toBe(403);
    const body = await resp.json();
    expect(body).toHaveProperty("error", "FORBIDDEN");
  });

  // -----------------------------------------------------------------------
  // Test 3: 400 – Body fehlt komplett
  // -----------------------------------------------------------------------
  it("3. 400 – Body fehlt (leeres JSON)", async () => {
    const resp = await postSession(
      {} as Record<string, unknown>,
      sessionCookie,
    );

    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body).toHaveProperty("error", "VALIDATION_ERROR");
  });

  // -----------------------------------------------------------------------
  // Test 5: 409 – SESSION_CONFLICT bei zweitem POST mit gleicher feature_set_id
  // -----------------------------------------------------------------------
  it("5. 409 – SESSION_CONFLICT", async () => {
    // Erster POST: Session oeffnen
    const resp1 = await postSession(validBody, sessionCookie);
    expect(resp1.status).toBe(201);

    // Zweiter POST: gleiche feature_set_id → Konflikt
    const resp2 = await postSession(validBody, sessionCookie);
    expect(resp2.status).toBe(409);

    const body2 = await resp2.json();
    expect(body2).toHaveProperty("error", "SESSION_CONFLICT");
  });
});

// ===========================================================================
// PATCH /api/workflow/session/:id – Fehlerfaelle
// ===========================================================================

describe("PATCH /api/workflow/session/:id – Fehlerfaelle", () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  // -----------------------------------------------------------------------
  // Test 6: 404 – session_id existiert nicht
  // -----------------------------------------------------------------------
  it("6. 404 – Session nicht gefunden", async () => {
    const resp = await patchSession(
      999_999,
      { version_id: "00000000-0000-0000-0000-000000000000" },
      sessionCookie,
    );

    expect(resp.status).toBe(404);
    const body = await resp.json();
    expect(body).toHaveProperty("error", "NOT_FOUND");
  });

  // -----------------------------------------------------------------------
  // Test 7: 403 – Session gehoert anderem User
  // -----------------------------------------------------------------------
  it("7. 403 – Session gehoert anderem User", async () => {
    // Session mit test@ oeffnen
    const openResp = await postSession(validBody, sessionCookie);
    expect(openResp.status).toBe(201);
    const openBody = await openResp.json();
    const sessionId = openBody.session_id as number;

    // PATCH mit noedit@ Cookie → 403 (Rollen-Check schlaegt fehl)
    if (!sessionCookieNoEdit) return;
    const closeResp = await patchSession(
      sessionId,
      { version_id: "00000000-0000-0000-0000-000000000000" },
      sessionCookieNoEdit,
    );

    expect(closeResp.status).toBe(403);
    const body = await closeResp.json();
    expect(body).toHaveProperty("error", "FORBIDDEN");
  });

  // -----------------------------------------------------------------------
  // Test 8: 422 – SESSION_NOT_ACTIVE (Session state manuell auf completed)
  // -----------------------------------------------------------------------
  it("8. 422 – SESSION_NOT_ACTIVE", async () => {
    // Session oeffnen
    const openResp = await postSession(validBody, sessionCookie);
    expect(openResp.status).toBe(201);
    const openBody = await openResp.json();
    const sessionId = openBody.session_id as number;

    // Session per Direkt-SQL auf 'completed' setzen
    await setSessionState(sessionId, "completed");

    // Testversion anlegen
    const versionId = await createTestVersion(sessionId);

    // PATCH versuchen → 422 weil state != 'active'
    const closeResp = await patchSession(
      sessionId,
      { version_id: versionId },
      sessionCookie,
    );
    expect(closeResp.status).toBe(422);

    const body = await closeResp.json();
    expect(body).toHaveProperty("error", "SESSION_NOT_ACTIVE");
  });

  // -----------------------------------------------------------------------
  // Test 9: 422 – VERSION_NOT_FOUND (version_id existiert nicht)
  // -----------------------------------------------------------------------
  it("9. 422 – VERSION_NOT_FOUND", async () => {
    // Session oeffnen
    const openResp = await postSession(validBody, sessionCookie);
    expect(openResp.status).toBe(201);
    const openBody = await openResp.json();
    const sessionId = openBody.session_id as number;

    // PATCH mit nicht-existenter version_id
    const closeResp = await patchSession(
      sessionId,
      { version_id: "00000000-0000-0000-0000-000000000000" },
      sessionCookie,
    );
    expect(closeResp.status).toBe(422);

    const body = await closeResp.json();
    expect(body).toHaveProperty("error", "VERSION_NOT_FOUND");
  });
});

// ===========================================================================
// Vollstaendiger Workflow (Tests 4 + 10)
// ===========================================================================
//
// Kein afterEach hier – die Session muss von Test 4 bis Test 10 erhalten
// bleiben. Aufraeumen erfolgt im globalen afterAll.

describe("vollstaendiger Workflow", () => {
  let sessionId: number;

  // -----------------------------------------------------------------------
  // Test 4: 201 – Session oeffnen (Schritte 1-3)
  // -----------------------------------------------------------------------
  it("4. 201 – Session oeffnen (Schritte 1-3)", async () => {
    const resp = await postSession(validBody, sessionCookie);
    expect(resp.status).toBe(201);

    const body = await resp.json();
    expect(body).toHaveProperty("session_id");
    expect(
      typeof body.session_id === "number" ||
        (typeof body.session_id === "string" &&
          !isNaN(Number(body.session_id))),
    ).toBe(true);
    expect(body).toHaveProperty("workflow_status", "in_bearbeitung");

    // Keine version_id oder snapshot_id im POST-Response
    expect(body).not.toHaveProperty("version_id");
    expect(body).not.toHaveProperty("snapshot_id");

    sessionId = Number(body.session_id);
  });

  // -----------------------------------------------------------------------
  // Test 10: 200 – Session schliessen (Schritte 5-6)
  // -----------------------------------------------------------------------
  it("10. 200 – Session schliessen (Schritte 5-6)", async () => {
    expect(sessionId).toBeDefined();

    // Testversion per Direkt-SQL anlegen (simuliert WFS-T-Insert des Browsers)
    const versionId = await createTestVersion(sessionId);

    // Session schliessen
    const closeResp = await patchSession(
      sessionId,
      { version_id: versionId },
      sessionCookie,
    );
    expect(closeResp.status).toBe(200);

    const body = await closeResp.json();
    expect(body).toHaveProperty("session_id", sessionId);
    expect(body).toHaveProperty("version_id", versionId);
    expect(body).toHaveProperty("snapshot_id");
    expect(typeof body.snapshot_id).toBe("number");
    expect(body).toHaveProperty("workflow_status", "qs1_ausstehend");
  });
});
