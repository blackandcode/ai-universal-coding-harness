/**
 * @fileoverview Modal panel component displaying the inventory of changed files in the working tree.
 * Renders the relative file paths detected through quality gates and git status diffs.
 */

import React from 'react';
import { ListPanel } from './ListPanel.js';

/**
 * Properties for rendering the ChangesPanel component.
 */
export interface ChangesPanelProps {
  /** Array of changed file paths */
  readonly changedFiles: readonly string[];
  /** Total allocated panel height */
  readonly height: number;
}

/**
 * Renders the modal view listing files changed during stage execution.
 *
 * @param props - ChangesPanelProps configuration.
 * @returns React.JSX.Element
 */
export function ChangesPanel({ changedFiles, height }: ChangesPanelProps): React.JSX.Element {
  const lines = changedFiles.length > 0 ? changedFiles : ['(No changed-file evidence yet)'];
  return <ListPanel title="Changed Files" lines={lines} height={height} />;
}
