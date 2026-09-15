/**
 * @fileoverview Generic framed list panel component for modal views (Todos, Changes, Logs).
 * Provides a standardized bounded layout containing a title, a bordered content box with fixed
 * vertical line padding, and an escape navigation footer.
 */

import React from 'react';
import { Box, Text } from 'ink';

/**
 * Properties for rendering the ListPanel component.
 */
export interface ListPanelProps {
  /** Title header for the panel */
  readonly title: string;
  /** Pre-formatted string lines to display in the list */
  readonly lines: readonly string[];
  /** Allocated total panel height */
  readonly height: number;
}

/**
 * Renders a standardized modal list view within the terminal interface.
 *
 * @param props - ListPanelProps configuration.
 * @returns React.JSX.Element
 */
export function ListPanel({ title, lines, height }: ListPanelProps): React.JSX.Element {
  const innerHeight = Math.max(1, height - 3);
  const body = lines.slice(0, innerHeight);

  // Pad remaining rows with blank strings to prevent terminal vertical shifting
  const paddedBody = [...body];
  while (paddedBody.length < innerHeight) {
    paddedBody.push('');
  }

  return (
    <Box height={height} flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        {title}
      </Text>
      <Box height={Math.max(1, height - 2)} borderStyle="round" paddingX={1} flexDirection="column">
        {paddedBody.map((line, idx) => (
          <Text key={`line-${idx}`}>{line}</Text>
        ))}
      </Box>
      <Text color="gray">Esc return</Text>
    </Box>
  );
}
