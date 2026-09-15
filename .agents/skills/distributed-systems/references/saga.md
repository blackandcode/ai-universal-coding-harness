# Saga pattern

Use a saga for a business transaction that spans multiple independently committed resources/services and can be expressed as local steps plus compensating/forward-recovery actions.

## Choreography

Services react to events without a central orchestrator.

Good when the workflow is small and naturally decentralized. Risk: hidden coupling and difficult global visibility as steps grow.

## Orchestration

A workflow/process manager explicitly tracks steps and outcomes.

Good for longer or compliance-critical workflows where state/visibility/timeout/compensation logic should be explicit.

## Compensation

Compensation is a business action, not database rollback. It may be imperfect (`refund`, `release reservation`, `cancel shipment`) and must itself be idempotent/retryable where necessary.

Persist workflow state. Do not rely on an in-memory promise chain for a workflow that must survive process restarts.
