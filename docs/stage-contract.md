# Stage Contract and Validation

A stage is a structured implementation package:

```text
stage-NN-kebab-name/
├── functional-spec.md
├── technical-spec.md
└── prompt.md
```

Examples:

```text
stage-06-policy-safety-and-admin-experience/
stage-07-ip-rules-and-page-selector/
```

## Required validation

Before implementation starts, each explicitly selected stage must satisfy all of the following:

1. Directory name matches `stage-NN-kebab-case-name`.
2. The stage directory is a real directory, not a symbolic link.
3. All three required Markdown files exist.
4. Required files are regular files, not symbolic links.
5. Required files are non-empty text files.
6. Every required file contains at least one Markdown heading.
7. A numeric stage selector resolves to exactly one stage; ambiguity is rejected.

The same validator is used by `validate`, `inspect`, `preflight`, and `run` stage resolution. `run` validates all selected stages before the run branch is created.

## Validate without running agents

```bash
ai-harness validate --stage-source docs/specifications/my-feature --stage 06
```

Validate every stage found in a source:

```bash
ai-harness validate --stage-source docs/specifications/my-feature
```

ZIP sources are supported and are checked for unsafe path traversal entries before extraction.
