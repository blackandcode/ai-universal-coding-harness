/**
 * @fileoverview Full-screen agent focus stream viewer with scroll navigation and follow status.
 * Renders the complete accumulated thought and action stream from the executor with scroll
 * support (up/down/page-up/page-down/home/end) and paused/following state indication.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { selectVisibleFocusLines } from '../selectors.js';

/**
 * Properties for rendering the FocusPanel component.
 */
export interface FocusPanelProps {
  /** Unformatted focus text stream */
  readonly text: string;
  /** Total allocated panel height */
  readonly height: number;
  /** Available terminal column width */
  readonly width: number;
  /** Scroll offset lines from the bottom */
  readonly offset: number;
  /** Whether the stream is actively following new output */
  readonly follow: boolean;
}

/**
 * Renders the dedicated full-panel stream viewer for executor thoughts and tool logs.
 *
 * @param props - FocusPanelProps configuration.
 * @returns React.JSX.Element
 */
export function FocusPanel({
  text,
  height,
  width,
  offset,
  follow,
}: FocusPanelProps): React.JSX.Element {
  const viewportHeight = Math.max(3, height - 4);
  const visibleLines = selectVisibleFocusLines(text, viewportHeight, offset, follow, width);

  return (
    <Box height={height} flexDirection="column" paddingX={1}>
      <Box height={2} justifyContent="space-between">
        <Text bold color="yellow">
          Agent Focus · full stream
        </Text>
        <Text color="gray">{follow ? 'following' : 'paused'}</Text>
      </Box>

      <Box height={viewportHeight} borderStyle="round" paddingX={1} flexDirection="column">
        {visibleLines.map((line, idx) => (
          <Text key={`focus-stream-${idx}`}>{line}</Text>
        ))}
      </Box>

      <Text color="gray">↑↓ scroll · PgUp/PgDn · Home/End · f/Esc main</Text>
    </Box>
  );
}
