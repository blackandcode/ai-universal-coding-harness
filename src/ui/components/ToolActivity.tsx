/**
 * @fileoverview Main body activity component rendering recent messages, active tools, and quality gates.
 * Displays executor/reviewer dialogues, tool execution status rows, and quality verification
 * summaries with fixed vertical height padding to eliminate terminal console jitter.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { UiMessage, UiQualityDisplay, UiTool } from '../types.js';
import { truncateText, getToolStatusIcon, getToolStatusColor } from '../text.js';
import { selectActiveAndRecentTools, selectRecentMessages } from '../selectors.js';

/**
 * Properties for rendering the ToolActivity component.
 */
export interface ToolActivityProps {
  /** Array of recorded conversational UI messages */
  readonly messages: readonly UiMessage[];
  /** Map of tool call IDs to tool objects */
  readonly tools: Readonly<Record<string, UiTool>>;
  /** Insertion order of tool IDs */
  readonly toolOrder: readonly string[];
  /** Latest quality gate verification outcome */
  readonly quality: UiQualityDisplay | null;
  /** Allocated row height for the activity panel */
  readonly height: number;
  /** Available column width */
  readonly width: number;
}

/**
 * Renders the dashboard's primary body section containing streaming messages and tool activity.
 *
 * @param props - ToolActivityProps configuration.
 * @returns React.JSX.Element
 */
export function ToolActivity({
  messages,
  tools,
  toolOrder,
  quality,
  height,
  width,
}: ToolActivityProps): React.JSX.Element {
  if (height <= 0) {
    return <Box />;
  }

  const recentMsgs = selectRecentMessages(messages, 2);
  const prioritizedTools = selectActiveAndRecentTools(tools, toolOrder, 3);
  const rows: React.JSX.Element[] = [];

  // 1. Conversational messages
  for (const m of recentMsgs) {
    const icon = m.role === 'reviewer' ? '🧠' : m.role === 'executor' ? '⚡' : '◆';
    const color =
      m.role === 'reviewer'
        ? 'magenta'
        : m.role === 'executor'
          ? 'cyan'
          : m.kind === 'error'
            ? 'red'
            : 'gray';

    rows.push(
      <Text key={`msg-${m.id}`} color={color}>
        {icon} {truncateText(m.text, width - 5)}
      </Text>,
    );
  }

  // 2. Active & recent tool executions
  for (const t of prioritizedTools) {
    const glyph = getToolStatusIcon(t.status);
    const color = getToolStatusColor(t.status);
    const label = `${t.title || 'Tool'}${t.detail ? ` · ${t.detail}` : ''}`;

    rows.push(
      <Text key={`tool-${t.id}`} color={color}>
        {glyph} {truncateText(label, width - 5)}
      </Text>,
    );
  }

  // 3. Quality status banner if evaluated
  if (quality) {
    const isPass = quality.status === 'PASS' || quality.pass === true;
    const summary = quality.quality_summary || quality.summary || '';
    const badge = `${isPass ? '✓' : '✗'} Quality ${quality.status} · ${summary}`;

    rows.push(
      <Text key="quality-banner" color={isPass ? 'green' : 'red'}>
        {truncateText(badge, width - 5)}
      </Text>,
    );
  }

  // Pad remaining rows to maintain strict vertical bounds
  const visibleRows = rows.slice(0, height);
  while (visibleRows.length < height) {
    visibleRows.push(<Text key={`blank-${visibleRows.length}`}> </Text>);
  }

  return (
    <Box height={height} flexDirection="column">
      {visibleRows}
    </Box>
  );
}
