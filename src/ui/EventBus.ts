/**
 * @fileoverview Event publishing bus and disk persistence manager for semantic UiEvents.
 * Buffers high-frequency executor tool updates and focus deltas, appends JSONL lines with
 * bounded byte caps, emits events to in-process listeners, and formats non-interactive terminal lines.
 */

import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { appendBounded, ensureDir } from '../core/fs.js';
import { iso } from '../core/time.js';
import type { UiEvent } from '../types.js';

/**
 * Publishes and buffers semantic UiEvents, maintaining both live EventEmitter streams
 * and durable append-only JSONL files on disk.
 */
export class EventBus {
  /** In-process event emitter transmitting events to attached UI subscribers */
  readonly emitter = new EventEmitter();

  private readonly tools = new Map<string, UiEvent>();
  private focus = '';
  private focusFile = '';
  private timer: NodeJS.Timeout | null = null;

  /**
   * Initializes the EventBus and ensures the destination event log file exists.
   *
   * @param eventFile - Absolute or relative path to the events.jsonl file.
   * @param lineMode - Whether to print formatted one-line summaries directly to console.
   * @param maxBytes - Maximum byte limit before rotating/bounding the JSONL file (default 20MB).
   * @param delay - Debounce delay in milliseconds for coalescing high-frequency tool/focus updates.
   */
  constructor(
    public readonly eventFile: string,
    public readonly lineMode: boolean = false,
    private readonly maxBytes: number = 20 * 1024 * 1024,
    private readonly delay: number = 80
  ) {
    ensureDir(path.dirname(eventFile));
    if (!fs.existsSync(eventFile)) {
      fs.writeFileSync(eventFile, '');
    }
  }

  /**
   * Emits a semantic event, scheduling debounced writes for high-frequency deltas
   * or immediately flushing and persisting significant state transitions.
   *
   * @param type - Semantic event type identifier.
   * @param payload - Structured event payload.
   * @returns The generated UiEvent record.
   */
  emit(type: string, payload: Record<string, unknown> = {}): UiEvent {
    const e: UiEvent = { ts: iso(), type, payload };

    if (type === 'executor.tool') {
      const toolId = String(payload?.id ?? payload?.toolCallId ?? Math.random());
      this.tools.set(toolId, e);
      this.schedule();
      return e;
    }

    if (type === 'executor.focus.delta') {
      this.focus += String(payload?.text ?? '');
      this.focusFile = (payload?.focus_file as string) ?? this.focusFile;
      this.schedule();
      return e;
    }

    this.flush();
    this.write(e);
    return e;
  }

  /**
   * Schedules a debounced flush for buffered tool/focus deltas.
   */
  private schedule(): void {
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.delay);
    }
  }

  /**
   * Immediately flushes all debounced focus and tool updates to disk and active subscribers.
   */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.focus) {
      this.write({
        ts: iso(),
        type: 'executor.focus.delta',
        payload: { text: this.focus, focus_file: this.focusFile }
      });
      this.focus = '';
    }

    for (const e of this.tools.values()) {
      this.write(e);
    }
    this.tools.clear();
  }

  /**
   * Closes the EventBus, flushing any remaining buffered deltas and detaching all listeners.
   */
  close(): void {
    this.flush();
    this.emitter.removeAllListeners();
  }

  /**
   * Writes a single validated event to disk, emits to listeners, and logs in lineMode if active.
   */
  private write(e: UiEvent): void {
    appendBounded(this.eventFile, JSON.stringify(e), this.maxBytes);
    this.emitter.emit('event', e);

    if (this.lineMode) {
      const lineText = this.formatLine(e);
      if (lineText) {
        console.log(lineText);
      }
    }
  }

  /**
   * Formats a concise one-line text representation of an event for non-interactive terminal modes.
   */
  private formatLine(e: UiEvent): string {
    const p = (e.payload as Record<string, unknown>) ?? {};

    const lineMap: Record<string, () => string> = {
      'run.started': () => `▶ Run ${(p.run_id as string) ?? ''} · ${(p.branch as string) ?? ''}`,
      'run.completed': () => `✓ Run completed · ${(p.branch as string) ?? ''}`,
      'run.blocked': () =>
        `✗ Run ${(p.status as string) ?? 'stopped'} · ${(p.reason as string) ?? ''}`,
      'stage.started': () => `▶ ${(p.stage as string) ?? 'Stage'} started`,
      'stage.completed': () => `✓ ${(p.stage as string) ?? 'Stage'} completed`,
      'stage.committed': () => `✓ Commit ${(p.stage as string) ?? ''} · ${(p.sha as string) ?? ''}`,
      'executor.message': () =>
        `⚡ ${String(p.text ?? '')
          .replace(/\s+/g, ' ')
          .trim()}`,
      'reviewer.fallback': () =>
        `🔄 Reviewer failover [${(p.trigger as string) ?? 'failure'}]: ${(p.failed_harness as string) ?? 'primary'} → ${(p.fallback_harness as string) ?? 'fallback'}`,
      'reviewer.plan': () =>
        `🧠 Plan ${(p.verdict as string) ?? ''}: ${(p.summary as string) ?? ''}`,
      'reviewer.permission': () =>
        `🧠 Permission ${(p.verdict as string) ?? ''}: ${(p.summary as string) ?? ''}`,
      'reviewer.question': () => `🧠 Answer: ${(p.answer as string) ?? ''}`,
      'executor.question.budget': () =>
        `! Question budget reached (${String(p.limit ?? '')}): autonomous fallback applied`,
      'evidence.warning': () => `! Quality warning: ${(p.message as string) ?? ''}`,
      'stage.advisory': () => `! Stage advisory: ${(p.message as string) ?? ''}`,
      'quality.result': () => {
        const status = (p.status as string) ?? '';
        const summary = (p.summary as string) ?? (p.quality_summary as string) ?? '';
        return `${status === 'PASS' ? '✓' : '✗'} Quality ${status}: ${summary}`;
      },
      'review.result': () =>
        `🧠 Final review ${(p.verdict as string) ?? ''}: ${(p.summary as string) ?? ''}`,
      log: () => {
        const icon = p.level === 'error' ? '✗' : p.level === 'warn' ? '!' : '·';
        return `${icon} ${(p.message as string) ?? ''}`;
      }
    };

    return lineMap[e.type]?.() ?? '';
  }
}
