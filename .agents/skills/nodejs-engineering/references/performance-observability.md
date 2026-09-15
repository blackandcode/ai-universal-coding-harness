# Performance and observability

Prefer evidence from profiling, tracing and metrics over intuition.

Useful Node signals include:

- event-loop utilization/delay
- heap usage and GC pressure
- request/job latency distributions
- external dependency latency/error rates
- connection-pool saturation
- queue depth
- throughput

Optimize large systemic costs before syntax-level micro-optimizations.
