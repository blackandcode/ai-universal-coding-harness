# Filesystem and cross-platform patterns

## Paths

- use `node:path` operations instead of string concatenation;
- resolve paths relative to an explicit trusted root;
- verify containment after normalization/realpath when security depends on it;
- handle case sensitivity differences conservatively;
- do not assume `/tmp`, `/bin/sh`, POSIX separators, or executable bits exist on Windows.

## Durable writes

For important state/config artifacts:

1. serialize deterministically where possible;
2. write a new temporary file in the same target directory;
3. flush when durability requirements justify it;
4. rename/replace deliberately according to platform semantics;
5. preserve a recoverable previous state if corruption would make resume unsafe.

Do not perform concurrent `writeFile` calls to the same path without coordination.

## ZIP/stage extraction

Extraction code is a trust boundary. Validate destination containment before writing each entry and reject traversal/absolute/drive-qualified paths and disallowed symlink behavior.

## Locks

A lock is an exclusion mechanism, not proof of state validity. On startup/resume, validate the persisted run/repository assumptions in addition to lock ownership/staleness rules.
