/**
 * @fileoverview Terminal layout and vertical row budget calculator for the Ink UI dashboard.
 * Categorizes terminal window sizes into normal, compact, or minimal modes and computes
 * bounded row allocations for header, focus preview, active tasks, tool activity, and footer panels.
 */

/**
 * Display density mode adapted to available terminal height.
 */
export type DashboardMode = 'normal' | 'compact' | 'minimal';

/**
 * Height row allocations and layout mode for dashboard components.
 */
export interface DashboardLayout {
  /** Selected display mode based on terminal vertical lines */
  readonly mode: DashboardMode;
  /** Maximum total rows permitted for the dashboard */
  readonly maxRows: number;
  /** Allocated rows for the top status header */
  readonly headerRows: number;
  /** Allocated rows for the inline agent focus preview */
  readonly focusRows: number;
  /** Allocated rows for the active todo task */
  readonly taskRows: number;
  /** Allocated rows for recent conversational messages */
  readonly messageRows: number;
  /** Allocated rows for active and recent tool executions */
  readonly toolRows: number;
  /** Allocated rows for the bottom keybinding footer */
  readonly footerRows: number;
}

/**
 * Calculates row allocations for dashboard sections based on terminal height.
 * Guarantees that the combined vertical rows never exceed the safe viewport capacity,
 * preventing vertical console scrolling and jitter.
 *
 * @param stdoutRows - Current terminal rows reported by stdout (or default 24).
 * @param configuredMax - Maximum allowed rows from user configuration (default 26).
 * @returns DashboardLayout specifying mode and section row budgets.
 */
export function dashboardLayout(stdoutRows: number, configuredMax: number = 26): DashboardLayout {
  const rows = Math.max(8, Number(stdoutRows) || 24);
  const maxRows = Math.max(7, Math.min(configuredMax, rows - 2));

  if (rows < 16) {
    return {
      mode: 'minimal',
      maxRows,
      headerRows: 5,
      focusRows: 0,
      taskRows: 0,
      messageRows: 0,
      toolRows: 0,
      footerRows: 1,
    };
  }

  if (rows < 24) {
    return {
      mode: 'compact',
      maxRows,
      headerRows: 6,
      focusRows: 4,
      taskRows: 0,
      messageRows: 2,
      toolRows: 3,
      footerRows: 1,
    };
  }

  return {
    mode: 'normal',
    maxRows,
    headerRows: 8,
    focusRows: 5,
    taskRows: 2,
    messageRows: 3,
    toolRows: 4,
    footerRows: 1,
  };
}
