# Path, ZIP, and symlink safety

Before mutable orchestration, stage sources must be structurally and path-safe.

## ZIP entries

Reject entries that are absolute, drive/UNC-qualified where inappropriate, contain traversal after normalization, or resolve outside the extraction root. Validate before writing. Do not trust archive library convenience extraction to enforce the project's containment policy.

## Stage directories/files

For required stage directories/files:

- require expected naming/shape;
- require real directories/regular files;
- reject symlink tricks where the contract prohibits them;
- verify containment against the trusted stage root;
- reject ambiguity rather than picking the first match.

## Realpath caveat

Lexical normalization alone does not catch all symlink escapes. Use filesystem-aware checks when a path exists and security depends on its actual target.

## Temporary files

Create temp artifacts with collision-resistant names inside controlled directories and avoid following attacker-controlled links during replace/update flows.
