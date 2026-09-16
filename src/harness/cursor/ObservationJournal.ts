/**
 * @fileoverview Observation journal persistence and in-memory observation cache for Cursor ACP.
 *
 * Appends normalized command observations and durable quality epoch markers to `executor-observations.jsonl`,
 * maintains an in-memory deduplicated list keyed by session and tool call identifiers,
 * and handles historical replay without duplicate file writes.
 *
 * @remarks
 * Invariant: All executor subprocess, tool executions, and quality epoch boundaries must be durably recorded
 * so that `EvidenceVerifier` and crash recovery can corroborate executor claims against ground truth.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CommandObservation, QualityEpochMarker } from '../../types.js';
import { ensureDir } from '../../core/fs.js';
import { validateCommandObservation } from '../../state/RunStateStore.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * In-memory command observation cache with optional durable JSONL file append.
 */
export class ObservationJournal {
  private observed: CommandObservation[] = [];
  private epochMarkers: QualityEpochMarker[] = [];
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
   * Returns a snapshot copy of all recorded quality epoch markers.
   *
   * @returns Array of recorded {@link QualityEpochMarker} objects.
   */
  getEpochMarkers(): QualityEpochMarker[] {
    return [...this.epochMarkers];
  }

  /**
   * Loads and validates command observations and quality epoch markers from an observations JSONL file.
   *
   * @param filePath - Absolute path to `executor-observations.jsonl`.
   * @returns Object containing validated, deduplicated observations and recorded epoch markers.
   */
  static loadJournal(filePath: string): {
    observations: CommandObservation[];
    markers: QualityEpochMarker[];
  } {
    if (!fs.existsSync(filePath)) {
      return { observations: [], markers: [] };
    }
    const journal = new ObservationJournal();
    let currentEpoch: QualityEpochMarker | null = null;

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let parsed: unknown;
        try {
          if (trimmed.startsWith('EPOCH ')) {
            parsed = JSON.parse(trimmed.slice(6));
          } else {
            parsed = JSON.parse(trimmed);
          }
        } catch {
          continue;
        }

        if (
          isRecord(parsed) &&
          parsed.record_type === 'quality_epoch_started' &&
          typeof parsed.quality_epoch_id === 'string'
        ) {
          const marker = parsed as unknown as QualityEpochMarker;
          currentEpoch = marker;
          journal.recordEpochMarker(marker, true);
          continue;
        }

        try {
          const obs = validateCommandObservation(parsed);
          if (!obs.quality_epoch_id && currentEpoch?.quality_epoch_id) {
            obs.quality_epoch_id = currentEpoch.quality_epoch_id;
          }
          if (!obs.stage && currentEpoch?.stage) {
            obs.stage = currentEpoch.stage;
          }
          if (obs.attempt == null && currentEpoch?.attempt != null) {
            obs.attempt = currentEpoch.attempt;
          }
          if (!obs.run_id && currentEpoch?.run_id) {
            obs.run_id = currentEpoch.run_id;
          }
          journal.record(obs, true);
        } catch {
          // Ignore invalid or unrecognized non-observation records
          continue;
        }
      }
    } catch {
      return { observations: [], markers: [] };
    }

    return {
      observations: journal.getObservations(),
      markers: journal.getEpochMarkers()
    };
  }

  /**
   * Appends an entry to the durable JSONL observations journal file if configured.
   *
   * @param entry - Command observation or quality epoch marker to persist.
   */
  private appendJournalFile(entry: CommandObservation | QualityEpochMarker): void {
    if (!this.journalFile) return;
    try {
      fs.appendFileSync(this.journalFile, JSON.stringify(entry) + '\n', 'utf8');
    } catch {}
  }

  /**
   * Records a durable quality epoch marker indicating the boundary of a quality verification attempt.
   *
   * @param marker - Quality epoch marker record to persist.
   * @param isReplay - When true, bypasses appending to disk to prevent replay duplication.
   */
  recordEpochMarker(marker: QualityEpochMarker, isReplay = false): void {
    this.epochMarkers.push(marker);
    if (!isReplay) {
      this.appendJournalFile(marker);
    }
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
        sequence: entry.sequence || this.observed[idx].sequence,
        quality_epoch_id: entry.quality_epoch_id ?? this.observed[idx].quality_epoch_id
      };
    } else {
      this.observed.push(entry);
    }

    if (!isReplay) {
      this.appendJournalFile(entry);
    }
  }

  /**
   * Clears in-memory observations and epoch markers.
   */
  clear(): void {
    this.observed = [];
    this.epochMarkers = [];
  }
}
