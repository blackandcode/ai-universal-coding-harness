/**
 * @fileoverview Header panel component rendering harness status, branch, stage, and phase progress.
 * Displays a framed terminal box containing run metadata, active stage indices, executor/reviewer
 * harness labels, colored phase indicators, and a visual ASCII completion meter.
 */

import React from 'react';
import { Box, Text } from 'ink';
import {
  PHASES,
  type PhaseName,
  type UiMeta,
  type UiPhaseMap,
  type RunUiStatus,
} from '../types.js';
import { formatProgressBar, getPhaseColor, getPhaseIcon, truncateText } from '../text.js';
import { selectPhaseProgress } from '../selectors.js';

/**
 * Properties for rendering the Header component.
 */
export interface HeaderProps {
  /** Overall status of the run */
  readonly status: RunUiStatus;
  /** Static run metadata (branch, labels) */
  readonly meta: Readonly<UiMeta>;
  /** Name of the stage currently executing */
  readonly currentStage: string;
  /** Current 1-based stage index */
  readonly stageIndex: number;
  /** Total stages to execute */
  readonly stageTotal: number;
  /** Attempt counter for the current stage */
  readonly attempt: number;
  /** Current phase statuses */
  readonly phase: UiPhaseMap;
  /** Target allocated row height */
  readonly height: number;
  /** Total available terminal column width */
  readonly width: number;
}

/**
 * Renders the top-level status header box of the interactive terminal dashboard.
 *
 * @param props - HeaderProps configuration.
 * @returns React.JSX.Element
 */
export function Header({
  status,
  meta,
  currentStage,
  stageIndex,
  stageTotal,
  attempt,
  phase,
  height,
  width,
}: HeaderProps): React.JSX.Element {
  const borderColor = status === 'completed' ? 'green' : status === 'running' ? 'cyan' : 'red';
  const progress = selectPhaseProgress(phase);
  const progressBar = formatProgressBar(progress.ratio, width);

  const stageLabel = currentStage ? `${stageIndex}/${stageTotal} ${currentStage}` : 'Preparing run';
  const attemptLabel = attempt > 0 ? ` · Attempt ${attempt}` : '';
  const branchLabel = meta.branch || '—';
  const executorLabel = meta.executorLabel || 'executor';
  const reviewerLabel = meta.reviewerLabel || 'reviewer';

  return (
    <Box
      height={height}
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      flexDirection="column"
    >
      <Box justifyContent="space-between">
        <Text bold color={borderColor}>
          AI Universal Coding Harness
        </Text>
        <Text color="gray">{status}</Text>
      </Box>

      <Text>Branch: {truncateText(branchLabel, Math.max(20, width - 14))}</Text>

      <Text>{truncateText(`Stage: ${stageLabel}${attemptLabel}`, Math.max(20, width - 8))}</Text>

      {height >= 7 ? (
        <Text color="gray">
          ⚡ {executorLabel} · 🧠 {reviewerLabel}
        </Text>
      ) : null}

      {height >= 7 ? (
        <Box gap={1}>
          {PHASES.map((p: PhaseName) => {
            const phaseStatus = phase[p];
            return (
              <Text key={p} color={getPhaseColor(phaseStatus)}>
                {getPhaseIcon(phaseStatus)} {p}
              </Text>
            );
          })}
        </Box>
      ) : null}

      <Text>
        <Text color="green">{progressBar.filled}</Text>
        <Text color="gray">{progressBar.unfilled}</Text>
        {` ${progressBar.percent}`}
      </Text>
    </Box>
  );
}
