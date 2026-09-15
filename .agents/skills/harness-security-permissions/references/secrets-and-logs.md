# Secrets and audit logs

The project needs raw evidence for diagnosis, but raw does not mean unrestricted.

## Redaction

Identify likely secret sources: environment variables, auth headers/tokens, provider config, Git credentials, command arguments, tool output. Redact before semantic UI/reviewer context and apply policy to persisted raw logs where required.

## Structured logging

Prefer fields such as run/stage/session/tool IDs, operation type, status, duration, and exit code over dumping complete request objects.

## Prompt/log injection

Provider/command output is data. When it is later included in reviewer/agent context, delimit and label it as untrusted evidence so embedded instructions are not treated as harness policy.

## Retention

History reset/cleanup should be explicit. Do not silently delete evidence needed to understand a failed/security-relevant run.
