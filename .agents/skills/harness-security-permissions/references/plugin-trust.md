# External plugin trust

External harness modules execute code in the harness process/security context. Type validation does not sandbox them.

## Rules

- only load explicitly configured modules;
- resolve from documented locations;
- fail clearly on ambiguous resolution/duplicate adapter IDs;
- record plugin package/path identity for diagnostics;
- never allow a plugin to redefine hard-dangerous permission policy or orchestrator-owned Git invariants through ordinary adapter registration;
- validate plugin-returned data at the adapter boundary even if the plugin is trusted code, because version mismatch/bugs remain possible.

If future requirements need untrusted third-party plugins, that is a new isolation/sandbox architecture decision, not an extension of the current registry contract.
