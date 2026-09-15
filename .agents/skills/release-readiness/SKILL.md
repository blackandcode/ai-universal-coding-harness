---
name: release-readiness
description: Use before publishing a GitHub or npm release of AI Universal Coding Harness. Covers semantic versioning, changelog, cross-platform CI, package contents, npm Trusted Publishing (OIDC), and CLI smoke checks.
---

# Release Readiness

1. Confirm semantic version in `package.json` and `src/version.ts` matches.
2. Update `CHANGELOG.md`.
3. Ensure `package.json.repository.url` exactly matches `git+https://github.com/blackandcode/ai-universal-coding-harness.git`.
4. Run `npm run verify`.
5. Run `npm pack --dry-run` and inspect published files.
6. Ensure the CLI bin contains a Node shebang and no runtime shell-script dependency exists.
7. Confirm GitHub CI covers Linux, Windows, and macOS.
8. Confirm `.github/workflows/publish-npm.yml` uses `id-token: write` and no long-lived npm publish token.
9. Confirm `package-lock.json` is committed before release so CI can use `npm ci`.
10. Tag releases as `vX.Y.Z` only after verification.
