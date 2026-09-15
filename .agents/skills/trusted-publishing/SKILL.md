---
name: trusted-publishing
description: Use when changing npm/GitHub release automation. Enforces npm Trusted Publishing with GitHub OIDC, provenance-friendly public releases, and no long-lived publish token.
---
# npm Trusted Publishing

- Publish from `.github/workflows/publish-npm.yml` on GitHub-hosted runners.
- Require `permissions: { contents: read, id-token: write }`.
- Do not use `NPM_TOKEN` for public publish automation.
- Use Node 22.14+ and npm 11.5.1+; the workflow currently uses Node 24 and npm 11.15+.
- Verify the release tag exactly matches `package.json` version.
- Run `npm ci`, full verification, and `npm pack --dry-run` before `npm publish`.
- Keep `package.json.repository.url` exactly aligned with the trusted GitHub repository.
- Document the one-time first publish needed before npm can attach a trusted publisher to a brand-new package.
