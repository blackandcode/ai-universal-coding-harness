# Publishing to GitHub and npm

The canonical public repository is:

```text
https://github.com/blackandcode/ai-universal-coding-harness
```

The npm package is:

```text
ai-universal-coding-harness
```

The repository includes:

```text
.github/workflows/ci.yml
.github/workflows/release.yml
.github/workflows/publish-npm.yml
```

## 1. Before the first release

Install dependencies and create/commit `package-lock.json`:

```bash
npm install
npm run verify
git add package-lock.json
git commit -m "build: lock npm dependencies"
```

Check that the npm package name is still available before the first publish:

```bash
npm view ai-universal-coding-harness
```

A `404`/not-found response means no public package currently exists under that name. Always verify immediately before publishing.

## 2. Bootstrap the npm package once

npm trusted-publisher configuration requires the package to already exist in the npm registry. For the first release only, publish interactively from a trusted workstation using your npm account with 2FA:

```bash
npm login
npm run verify
npm publish --access public
```

After `1.0.0` exists, configure trusted publishing and use CI for future versions. The publish workflow is idempotent: when a GitHub Release points at a version already present on npm (for example the manually bootstrapped `1.0.0`), it verifies the release and skips only the duplicate `npm publish` step.

## 3. Configure npm Trusted Publishing (OIDC)

Open the npm package page:

```text
Packages → ai-universal-coding-harness → Settings → Trusted publishing
```

Add a **GitHub Actions** trusted publisher with exactly:

```text
Organization or user: blackandcode
Repository:           ai-universal-coding-harness
Workflow filename:    publish-npm.yml
Environment:          leave empty
Allowed action:       npm publish
```

The workflow filename must be only `publish-npm.yml`, not `.github/workflows/publish-npm.yml`.

The `repository.url` in `package.json` is intentionally set to:

```text
git+https://github.com/blackandcode/ai-universal-coding-harness.git
```

Keep it exactly aligned with the GitHub repository because npm validates repository identity during trusted publishing.

## 4. Security hardening after OIDC works

After one successful OIDC publish, open npm package **Settings → Publishing access** and choose the strongest policy compatible with your maintenance process, preferably:

```text
Require two-factor authentication and disallow tokens
```

Then revoke any old automation publish tokens that are no longer needed.

The GitHub workflow does **not** require `NPM_TOKEN` or `NODE_AUTH_TOKEN` for public dependencies. It uses short-lived GitHub OIDC credentials through:

```yaml
permissions:
  contents: read
  id-token: write
```

## 5. Release flow

Update versions and changelog:

```bash
npm version patch --no-git-tag-version
# update CHANGELOG.md
npm run verify
```

Commit, then tag:

```bash
git add package.json package-lock.json CHANGELOG.md src/version.ts
git commit -m "chore: release v2.1.4"
git tag v2.1.4
git push origin main
git push origin v2.1.4
```

`release.yml` creates the GitHub Release and package tarball. Publishing the GitHub Release triggers `publish-npm.yml`.

The npm workflow:

1. checks out the exact release tag;
2. uses Node 24 on a GitHub-hosted runner;
3. ensures npm 11.15+ is installed;
4. checks that the GitHub release tag equals `v<package.json version>`;
5. runs `npm ci`;
6. runs the full verification suite;
7. runs `npm pack --dry-run`;
8. checks whether the exact package version is already present on npm;
9. runs plain `npm publish` with OIDC authentication only when that version is not already published.

No long-lived npm write token is stored in GitHub.

## 6. Provenance

For a public package published from this public GitHub repository using npm trusted publishing, npm automatically generates provenance attestations. The workflow intentionally does not add a separate `--provenance` flag.

## Requirements and limitations

Trusted publishing currently requires:

- Node.js 24.18 or newer;
- npm 11.5.1 or newer;
- GitHub-hosted Actions runners for the GitHub provider;
- `id-token: write` in the publish job/workflow;
- a trusted-publisher entry whose repository/workflow fields exactly match the workflow.

The release workflow uses Node 24 and upgrades npm to a current 11.15+ release before publishing.

## Official references

- npm Trusted Publishers: https://docs.npmjs.com/trusted-publishers/
- npm trust command: https://docs.npmjs.com/cli/v11/commands/npm-trust/
- npm publish: https://docs.npmjs.com/cli/v11/commands/npm-publish/
- GitHub OIDC reference: https://docs.github.com/en/actions/reference/security/oidc

## Optional: staged publishing for an extra human gate

For an even stricter release process, npm supports trusted `npm stage publish`. The workflow can stage the tarball through OIDC and a maintainer can later approve it with 2FA in npmjs.com or the npm CLI. If you adopt that mode, configure the trusted publisher for staged publishing and replace the final `npm publish` step accordingly.
