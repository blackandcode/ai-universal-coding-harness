/**
 * @fileoverview Observation journal persistence and in-memory observation cache for Cursor ACP.
 *
 * Appends normalized command observations durably to `executor-observations.jsonl`,
 * maintains an in-memory deduplicated list keyed by session and tool call identifiers,
 * and handles historical replay without duplicate file writes.
 *
 * @remarks
 * Invariant: All executor subprocess and tool executions must be durably recorded
 * so that `EvidenceVerifier` can corroborate executor claims against ground truth.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CommandObservation } from '../../types.js';
import { ensureDir } from '../../core/fs.js';

/**
 * In-memory command observation cache with optional durable JSONL file append.
 */
export class ObservationJournal {
  private observed: CommandObservation[] = [];
  private journalFile: string;

  /**
   * Initializes the observation journal with an optional durable file target.
   *
   * @param journalFile - Absolute path to `executor-observations.jsonl` file.
   */
  constructor(journalFile?: string) {
    this.journalFile = journalFile || '';
    if (this.journalFile) {
      ensureDir(path.dirname(this.journalFile));
    }
  }

  /**
   * Returns a snapshot copy of all accumulated observations.
   *
   * @returns Array of recorded {@link CommandObservation} objects.
   */
  getObservations(): CommandObservation[] {
    return [...this.observed];
  }

  /**
   * Appends an entry to the durable JSONL observations journal file if configured.
   *
   * @param entry - Command observation to persist.
   */
  private appendJournalFile(entry: CommandObservation): void {
    if (!this.journalFile) return;
    try {
      fs.appendFileSync(this.journalFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch {}
  }

  /**
   * Records or updates a command observation, deduplicating by session and tool call ID.
   *
   * @remarks
   * When an observation update arrives (e.g. tool transition from `in_progress` to `completed`),
   * the existing in-memory entry is patched with the final exit code and status.
   *
   * @param entry - Authoritative observation record to store.
   * @param isReplay - When true, bypasses appending to the durable disk file to prevent replay duplication.
   */
  record(entry: CommandObservation, isReplay = false): void {
    const idx = this.observed.findIndex(
      (x) => x.tool_call_id === entry.tool_call_id && x.session_id === entry.session_id
    );

    if (idx >= 0) {
      this.observed[idx] = {
        ...this.observed[idx],
        ...entry,
        exit_code: entry.exit_code ?? this.observed[idx].exit_code,
        status: entry.status || this.observed[idx].status,
        sequence: entry.sequence || this.observed[idx].sequence
      };
    } else {
      this.observed.push(entry);
    }

    if (!isReplay) {
      this.appendJournalFile(entry);
    }
  }

  /**
   * Clears in-memory observations.
   */
  clear(): void {
    this.observed = [];
  }
}
