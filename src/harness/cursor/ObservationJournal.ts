/**
 * @fileoverview Observation journal persistence and in-memory observation cache for Cursor ACP.
 *
 * Appends normalized command observations durably to executor-observations.jsonl,
 * maintains an in-memory deduplicated list keyed by session and tool call identifiers,
 * and handles historical replay.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CommandObservation } from '../../types.js';
import { ensureDir } from '../../core/fs.js';

export class ObservationJournal {
  private observed: CommandObservation[] = [];
  private journalFile: string;

  /**
   * Initializes the observation journal with an optional durable file target.
   *
   * @param journalFile - Path to executor-observations.jsonl
   */
  constructor(journalFile?: string) {
    this.journalFile = journalFile || '';
    if (this.journalFile) {
      ensureDir(path.dirname(this.journalFile));
    }
  }

  /**
   * Returns a copy of all accumulated observations.
   */
  getObservations(): CommandObservation[] {
    return [...this.observed];
  }

  /**
   * Appends an entry to the durable JSONL observations journal file if configured.
   *
   * @param entry - Command observation to persist
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
   * @param entry - Observation to record
   * @param isReplay - When true, bypasses appending to the durable file
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
