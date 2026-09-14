// SPDX-FileCopyrightText: 2026-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// @p2d2/core — Schmales DbClient-Interface.
//
// Core kennt bewusst KEINE `postgres`-Pakettypen. Dieses Interface bildet
// nur die von der Workflow-Logik tatsächlich genutzte SQL-Oberfläche ab:
//   - Tagged-Template-Query:    db\`SELECT ...\`
//   - Identifier-Quoting:       db("schema"), db("tabelle")
//   - Roh-Query mit Parametern: db.unsafe(sql, params)
//   - Transaktion:               db.begin(async (tx) => { ... })
//
// Die App (`src/lib/db.ts`) implementiert es mit der echten `postgres`-Instanz.

export interface DbClient {
  /** Tagged-Template-Query (liefert ein thenable, wie postgres `PendingQuery`). */
  (strings: TemplateStringsArray, ...values: any[]): PromiseLike<any[]>;
  /** Identifier/Value-Quoting für die Einbettung in Tagged-Template-Queries. */
  (value: string): any;
  /** Roh-Query mit positionsgebundenen Parametern ($1, $2, ...). */
  unsafe(query: string, params?: readonly any[]): PromiseLike<any[]>;
  /** Startet eine Transaktion; der Callback erhält einen transaktionsgebundenen Client. */
  begin<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
}
