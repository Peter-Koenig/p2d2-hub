// SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// p2d2: PostgreSQL-Connection-Singleton (postgres npm package)
//        Stellt eine wiederverwendbare sql-Instanz bereit.
//        Verbindungsparameter kommen aus astro:env/server.

import postgres from 'postgres';
import {
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
} from 'astro:env/server';

let sql: postgres.Sql<{}> | null = null;

/**
 * Gibt eine geteilte postgres()-Instanz zurück.
 * Erzeugt beim ersten Aufruf die Verbindung aus den Umgebungsvariablen.
 * Die Verbindung bleibt bestehen, bis `closeDb()` aufgerufen wird.
 *
 * Verwendung:
 *   const sql = getDb();
 *   await sql\`SELECT 1 AS ok\`;
 */
export function getDb(): postgres.Sql<{}> {
  if (!sql) {
    const connectionString = `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
    sql = postgres(connectionString, {
      // Max. 10 Verbindungen im Pool (default 10)
      max: 10,
      // Verbindung nach 30s Leerlauf schließen
      idle_timeout: 30,
      // Max. 60s Verbindungsaufbau
      connect_timeout: 60,
    });
  }
  return sql;
}

/**
 * Schließt die Datenbankverbindung (z. B. beim Server-Shutdown).
 * Nach dem Aufruf erzeugt der nächste `getDb()`-Aufruf eine neue Verbindung.
 */
export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
  }
}
