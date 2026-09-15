/**
 * @fileoverview Modal panel component displaying the full list of stage todos and task states.
 * Formats task items with status glyphs (completed, in-progress, pending) inside a ListPanel.
 */

import React from 'react';
import type { UiTodo } from '../types.js';
import { selectFormattedTodos } from '../selectors.js';
import { ListPanel } from './ListPanel.js';

/**
 * Properties for rendering the TodoPanel component.
 */
export interface TodoPanelProps {
  /** Array of todos tracked in the current stage */
  readonly todos: readonly UiTodo[];
  /** Total allocated panel height */
  readonly height: number;
}

/**
 * Renders the modal view listing all task todos for the active stage.
 *
 * @param props - TodoPanelProps configuration.
 * @returns React.JSX.Element
 */
export function TodoPanel({ todos, height }: TodoPanelProps): React.JSX.Element {
  const lines = selectFormattedTodos(todos);
  return <ListPanel title="Todos" lines={lines} height={height} />;
}
