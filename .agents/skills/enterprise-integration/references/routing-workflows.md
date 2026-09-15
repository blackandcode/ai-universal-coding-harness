# Routing and workflow patterns

Use the smallest pattern that fits.

## Content-based router

Route messages based on explicit message content/type. Keep routing rules observable and versioned.

## Splitter

Break a composite message/work item into independently processable parts. Carry a correlation ID and sequence metadata if recombination matters.

## Aggregator

Combine related messages/results. Define completion policy, timeout, duplicate handling, and storage of partial state.

## Scatter-gather

Send work to several recipients and combine responses. Bound fan-out, define timeout/partial-result policy, and avoid waiting forever for every responder.

## Process manager

Maintain explicit workflow state for a long-running integration process. When compensation and cross-service transactions dominate, also read `distributed-systems` saga guidance.
