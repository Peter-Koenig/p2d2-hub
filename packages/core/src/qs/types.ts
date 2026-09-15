// SPDX-FileCopyrightText: 2026-2026 Peter König <peter.koenig@data-dna.eu>
// SPDX-License-Identifier: EUPL-1.2
// @p2d2/core — QS-Skelett (PLATZHALTER, KEINE Implementierung).
//
// ACHTUNG: Diese Datei enthält ausschließlich vorbereitende Typen und
// Interfaces für zukünftige Fachlogik. Es existiert KEIN Laufzeitverhalten,
// keine DB-Zugriffe und keine API-Routen dahinter. Die vorhandene
// QS-1-/Snapshot-Logik in `workflow/db.ts` bleibt unangetastet.
//
// Inhalt:
//   1. QS-2-Statusmaschine (wf_event_type, exportdone, physisches Löschen)
//   2. Periodische Snapshot-Loss-Prevention (kind='auto' + Recovery)

// ===========================================================================
// 1. QS-2-Statusmaschine (Platzhalter)
// ===========================================================================

/**
 * Zustände von `wf_feature_status.state`.
 *
 * `in_bearbeitung` und `qs1_ausstehend` sind bereits in `workflow/db.ts`
 * implementiert; alle weiteren Zustände sind zukünftig (QS-1-Review,
 * QS-2-Review, Export-Gate, physisches Löschen).
 */
export type WfFeatureStatusState =
  | "in_bearbeitung" // implementiert (workflow/db.ts)
  | "qs1_ausstehend" // implementiert (workflow/db.ts)
  | "qs1_bestaetigt" // zukünftig
  | "qs2_ausstehend" // zukünftig
  | "export_bereit" // zukünftig
  | "exportiert" // zukünftig
  | "geloescht"; // zukünftig

/**
 * Event-Typen für `wf_protokoll.wf_event_type` (Platzhalter).
 *
 * `exportdone` markiert den abgeschlossenen OSM-Export als Voraussetzung für
 * das physische Löschen der Nutzdaten.
 */
export type WfEventType =
  | "session_opened"
  | "session_completed"
  | "exportdone"
  | "physical_delete";

/**
 * Export-Gate-Schnittstelle der QS-2-Statusmaschine (Platzhalter).
 *
 * Beschreibt den zukünftigen Übergang: erst `exportdone`-Event, danach darf
 * physisch gelöscht werden. Keine Implementierung vorhanden.
 */
export interface Qs2ExportGate {
  /** Prüft, ob ein Feature den Export-Gate passieren darf. */
  canExport(featureId: string): Promise<boolean>;
  /** Markiert den Export als abgeschlossen (wf_event_type: exportdone). */
  markExported(featureId: string): Promise<void>;
  /** Löst das physische Löschen der Nutzdaten aus. */
  deleteFeatureData(featureId: string): Promise<void>;
}

// ===========================================================================
// 2. Periodische Snapshot-Loss-Prevention (Platzhalter)
// ===========================================================================

/** Art eines Snapshots. `manual` ist implementiert, `auto` zukünftig. */
export type SnapshotKind = "manual" | "auto";

/**
 * Automatischer Snapshot (minütliche Loss-Prevention, zukünftig).
 *
 * Heute existiert nur der manuelle Final-Snapshot (`kind='manual'`) in
 * `workflow/db.ts::insertSnapshotRecord`. Ein periodischer Autosave und der
 * zugehörige Hintergrund-Recovery-Prozess fehlen noch.
 */
export interface AutoSnapshot {
  sessionId: number;
  featureUuid: string;
  kind: "auto";
  snapshotNo: number;
  createdAt: string;
}

/**
 * Recovery-Schnittstelle (Platzhalter).
 *
 * Soll zukünftig die Auto-Snapshots einer Session zu einer wählbaren,
 * wiederherstellbaren Version zusammenführen. Keine Implementierung vorhanden.
 */
export interface SnapshotRecoveryProvider {
  /**
   * Führt die Auto-Snapshots einer Session zu einer Version zusammen.
   * @returns version_id der wiederherstellbaren Version
   */
  recover(sessionId: number): Promise<string>;
}
