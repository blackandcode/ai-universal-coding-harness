# Architecture smells

Investigate rather than automatically reject:

- orchestrator starts parsing provider-specific event fields;
- adapter performs branch/commit logic;
- reviewer path writes project files;
- UI code decides run phase;
- `core/` becomes a miscellaneous utility bucket;
- same Git/process/path logic appears in multiple modules;
- one state concept represented by several booleans;
- raw provider output is cast directly to trusted TypeScript types;
- missing telemetry triggers silent “run it again ourselves” fallback;
- interfaces mirror single implementations without isolating a seam;
- “manager/service/helper” layers only forward calls;
- retry loops exist at multiple layers;
- command safety checks inspect only a string prefix/executable name;
- tests mock the very filesystem/Git/process behavior they are supposed to validate.

A smell becomes a finding only when you can describe the concrete maintenance, correctness, security, or recovery risk in this codebase.
