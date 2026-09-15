/**
 * @fileoverview Compact agent focus preview box rendered within the main dashboard.
 * Displays the trailing slice of executor focus text wrapped to terminal column bounds
 * with fixed vertical row padding to ensure zero console jitter.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { wrapText } from '../text.js';

/**
 * Properties for rendering the FocusPreview component.
 */
export interface FocusPreviewProps {
  /** Raw accumulated focus text from the executor */
  readonly text: string;
  /** Allocated row height for the preview box */
  readonly height: number;
  /** Total available terminal column width */
  readonly width: number;
}

/**
 * Renders a fixed-height preview box showing the latest lines of executor thought/focus stream.
 *
 * @param props - FocusPreviewProps configuration.
 * @returns React.JSX.Element
 */
export function FocusPreview({ text, height, width }: FocusPreviewProps): React.JSX.Element {
  if (height <= 0) {
    return <Box />;
  }

  const contentHeight = Math.max(1, height - 2);
  const safeWidth = Math.max(20, width - 8);
  const lines = wrapText(text || '(Awaiting executor focus/progress…)', safeWidth);

  const visible = lines.slice(-contentHeight);
  while (visible.length < contentHeight) {
    visible.unshift('');
  }

  return (
    <Box
      height={height}
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      flexDirection="column"
    >
      <Text color="yellow" bold>
        Agent Focus
      </Text>
      {visible.map((line, idx) => (
        <Text key={`focus-line-${idx}`}>{line}</Text>
      ))}
    </Box>
  );
}
