# Node observability patterns

## Correlation context

Use `AsyncLocalStorage` for request/job scoped context such as correlation IDs, tenant IDs (subject to privacy policy), trace identifiers, and logger bindings. Prefer it over hand-rolled async hooks.

Do not store mutable business state in global async context when explicit parameters would make dependencies clearer.

## Logs

Use structured logs. Include stable event names and identifiers; avoid dumping full request bodies, credentials, tokens, or personal data.

## Metrics

Measure service behavior, not only machine resources:

- throughput;
- latency distribution;
- error/retry/timeout rate;
- queue depth/consumer lag;
- DB pool saturation;
- event-loop delay/utilization where relevant;
- outbox/projection lag for asynchronous systems.

## Traces

Trace cross-service/external dependency calls when distributed latency/failure analysis matters. Propagate standard trace context through HTTP and messaging contracts.

## Diagnostics Channel

Node's `diagnostics_channel` is a stable low-level hook used by instrumentation libraries. Application teams usually consume it through observability tooling rather than creating ad-hoc diagnostic protocols everywhere.
