/**
 * @fileoverview Footer panel component displaying keyboard navigation shortcuts and reviewer metrics.
 * Renders keybinding hints appropriate for the active layout mode alongside reviewer invocation counts.
 */

import React from 'react';
import { Box, Text } from 'ink';

/**
 * Properties for rendering the Footer component.
 */
export interface FooterProps {
  /** Target row height (typically 1) */
  readonly height: number;
  /** Whether minimal layout mode is currently active */
  readonly minimal: boolean;
  /** Total number of reviewer harness invocations */
  readonly reviewerCalls: number;
}

/**
 * Renders the bottom footer status bar with keyboard navigation hints and invocation metrics.
 *
 * @param props - FooterProps configuration.
 * @returns React.JSX.Element
 */
export function Footer({ height, minimal, reviewerCalls }: FooterProps): React.JSX.Element {
  if (height <= 0) {
    return <Box />;
  }

  const shortcuts = minimal
    ? 'f focus · q quiet'
    : 'f focus · t todos · d changes · l logs · q quiet';

  return (
    <Box height={height} justifyContent="space-between">
      <Text color="gray">{shortcuts}</Text>
      <Text color="gray">Reviewer calls {reviewerCalls}</Text>
    </Box>
  );
}
