/**
 * @fileoverview Modal panel component displaying the trailing ring buffer of diagnostic logs.
 * Formats level tags and message strings inside a standardized ListPanel.
 */

import React from 'react';
import type { UiLogEntry } from '../types.js';
import { selectFormattedLogs } from '../selectors.js';
import { ListPanel } from './ListPanel.js';

/**
 * Properties for rendering the LogsPanel component.
 */
export interface LogsPanelProps {
  /** Array of diagnostic log entries */
  readonly logs: readonly UiLogEntry[];
  /** Total allocated panel height */
  readonly height: number;
}

/**
 * Renders the modal view showing recent diagnostic log entries.
 *
 * @param props - LogsPanelProps configuration.
 * @returns React.JSX.Element
 */
export function LogsPanel({ logs, height }: LogsPanelProps): React.JSX.Element {
  const lines = selectFormattedLogs(logs, height);
  return <ListPanel title="Recent Logs" lines={lines} height={height} />;
}
