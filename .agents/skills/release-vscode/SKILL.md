---
name: release-vscode
description: Manage Pochi VS Code extension rolling releases from main — inspect pending changes and CI/E2E gates, sync Cloudflare livekit-cf deployments, cut Pre-release (odd minor) or promote to Stable (even minor), generate GitHub Release Notes, and perform fast rollbacks or hotfixes. Use when the user asks to check release status, cut a pre-release, promote to stable, deploy livekit-cf before release, or roll back / hotfix a VS Code extension release ("/release-vscode", "发个 pre-release", "升正式版", "看看有什么待发的", "回滚扩展版本").
---

# Release Pochi VS Code Extension (Rolling Release)

Pochi's VS Code extension ships directly from verified commits on `main` using git tags (`vscode@X.Y.Z`), without maintaining routine `release-vscode-*` branches or `chore: release` version-bump commits:

- **Channel rule** (`packages/vscode/scripts/publish.cjs` + `.github/workflows/release-pochi-vscode-extension.yml`):
  - **Odd minor** (`0.85.0`, `0.85.1`, ...): published to **Pre-release** on VS Code Marketplace & Open VSX, and marked Pre-release on GitHub Releases.
  - **Even minor** (`0.86.0`, `0.86.1`, ...): published to **Stable** on VS Code Marketplace & Open VSX.
  - Never use `-rc` / `-alpha` / `-dev` suffixes in `vscode@*` tags (VS Code Marketplace rejects semver pre-release strings).
- **Tag-driven versioning + async `-dev` sync**: `.github/workflows/release-pochi-vscode-extension.yml` extracts `X.Y.Z` from the `vscode@X.Y.Z` tag and writes it into `packages/vscode/package.json` in CI before `vsce package`. Thus the **exact same commit SHA** tested as `vscode@0.85.x` (Pre-release) can be promoted to `vscode@0.86.0` (Stable) simply by pushing the even tag, without blocking releases on version-bump PRs. After promoting a Stable release, `cut promote` (or `bump-dev`) opens an async auto-merge PR updating `packages/vscode/package.json` on `main` to the next `0.XX.0-dev` cycle so local development and `X-Pochi-Client` headers stay current.
- **No percentage rollout on Marketplace**: safety relies on `pre-push` + `test-integration` CI gates, Pre-release dogfooding, compatibility checks before tagging, and fast patch-tag rollback.

All deterministic checks and calculations live in `.agents/skills/release-vscode/scripts/release.mjs`:

```bash
R="node .agents/skills/release-vscode/scripts/release.mjs"
```

Options are parsed strictly: unknown, misspelled, or unsupported options (e.g. `--dryrun`) abort with an error instead of being ignored. Both `--target abc` and `--target=abc` work, and options may appear before or after the `cut` mode.

---

## 1. Check Status & Readiness (`status`)

Always start here before cutting any release:

```bash
$R status --find-green
```

Review the 4 sections it prints:

1. **Current tags, `main` `package.json` sync, & next calculated versions** (`prerelease`, `promote`, `rollback`, `hotfix`). If `main`'s `packages/vscode/package.json` is behind the active `0.XX.0-dev` cycle, run `$R bump-dev`.
2. **CI Gates on target SHA**: BOTH `pre-push` (`ci.yml`) and `test-integration` (`test-integration.yml`) must be `OK`.
   - If `origin/main` HEAD is still running checks, either wait (`gh run watch`) or pass `--target <nearest-green-sha>` reported by `--find-green`.
3. **Cloudflare `livekit-cf` drift**: if `packages/livekit/`, `packages/livekit-cf/`, or `packages/vscode-webui/` changed since the last `deploy-livekit-cf.yml` run, deploy `livekit-cf` before cutting the extension release (Step 2). `UNKNOWN` means the drift could not be computed (e.g. the last deploy commit is not available locally); treat it as `NEEDS DEPLOY`.
4. **Compatibility & Rollback Warnings**:
   - `livestore-schema`: inspect the diff in `packages/livekit/src/livestore/` to confirm changes are additive/backward-compatible (if we have to roll the extension back, users' local SQLite DBs already have the new events/tables).
   - `backend-contract`: if `packages/vendor-pochi/` or server API contracts changed, confirm with the user that `ragdoll` production server is already deployed.
   - `config-schema`: confirm `.pochi/config.jsonc` additions degrade gracefully on the previous Stable build.

---

## 2. Sync Cloudflare Share / LiveStore Worker (`deploy-livekit`)

When `status` reports `Cloudflare livekit-cf: NEEDS DEPLOY`:

```bash
$R deploy-livekit --wait
```

This dispatches `.github/workflows/deploy-livekit-cf.yml` on `main` (pass `--ref <branch>` when deploying from a hotfix branch) and waits (~1m20s) for completion so Share links and LiveStore sync match the upcoming extension build. With `--wait`, the command fails if it cannot find the triggered run, so a zero exit code always means the deploy succeeded. Pass `--skip-livekit-check` to `cut` only if the user explicitly confirms those changes do not require worker redeployment.

---

## 3. Cut a Pre-release from `main` (`prerelease`)

1. Preview the exact tag, target commit, gates, warnings, and generated Release Notes:
   ```bash
   $R cut prerelease --dry-run
   ```
   (Use `--target <sha>` if targeting the nearest green commit instead of `origin/main` HEAD.)
2. Confirm with the user if any `HIGH` compatibility warning was reported or if the user only asked for a dry-run/status check.
3. Execute the release, watch the GitHub Actions publish run (~2m15s), and automatically populate the GitHub Release Notes:
   ```bash
   $R cut prerelease
   ```

**Version progression**:
- After Stable `vscode@0.84.0` → cuts `vscode@0.85.0`.
- Follow-up fixes merged to `main` during the same pre-release cycle → cuts `vscode@0.85.1`, `vscode@0.85.2`, etc.

---

## 4. Promote Pre-release to Stable (`promote`)

Once the active Pre-release (`vscode@0.85.x`) has been dogfooded without blockers:

1. Preview promotion (by default targets the **exact commit SHA** of the latest active Pre-release tag and compiles cumulative Release Notes since the previous Stable tag):
   ```bash
   $R cut promote --dry-run
   ```
2. Confirm with the user, then publish Stable (`vscode@0.86.0`), write the cumulative Release Notes, and automatically open an auto-merge PR bumping `packages/vscode/package.json` on `main` to `0.87.0-dev` (pass `--no-bump-dev` to skip, or run `$R bump-dev` later):
   ```bash
   $R cut promote
   ```

*(Only pass `--target <sha>` to `cut promote` if explicitly asked to promote a different verified commit without cutting an intermediate Pre-release first.)*

---

## 5. Emergency Rollback & Hotfix

Marketplaces do not allow unpublishing or overwriting an existing version number; recovery always publishes a higher `patch` version on the Stable channel (`vscode@0.XX.(Y+1)`).

For every `cut` mode, `release.mjs` verifies (`workflowSupportsTagVersion`) that the target commit contains the tag-version injection in `.github/workflows/release-pochi-vscode-extension.yml`. A tag push runs the workflow as committed at the tagged commit, so targets that predate it (all tags before `0.85.0`, such as `vscode@0.84.0`) would publish the version hardcoded in their `package.json`, and they are blocked.

`rollback` and `hotfix` gate only on `test-integration`: `ci.yml` (`pre-push`) runs only on `main` and PRs to `main`, so release-branch commits never get a `pre-push` run.

### Option A: Fast Re-tag Rollback (Preferred — ~2.5 min)
Re-packages the previous known-good Stable commit SHA as the next Stable patch version:

```bash
$R cut rollback --dry-run
$R cut rollback
```

- `--target` must be an existing `vscode@X.Y.Z` release tag (defaults to the previous Stable). To ship any new commit, use `cut hotfix` (Option B).
- Legacy tags (before `0.85.0`) are blocked by the workflow guard above. Restore them with Option B: base a hotfix branch on the legacy tag and cherry-pick the release workflow change.
- Before rolling back across a `livestore-schema` change, prefer a forward hotfix (Option B) if local LiveStore state was migrated incompatibly.

### Option B: Targeted Hotfix Branch (Only when `main` has unshippable changes)
If a critical bug in Stable `vscode@0.86.0` is fixed on `main` by PR `<fix-sha>`, **and** `main` already contains other commits that must not go straight to Stable:

```bash
git fetch origin --tags
git switch -c release-vscode-0-86 vscode@0.86.0^{commit}
git cherry-pick <fix-sha>
git push -u origin release-vscode-0-86
```

Wait for `test-integration.yml` on `release-vscode-0-86` to turn green, then tag and publish:

```bash
$R cut hotfix --target origin/release-vscode-0-86 --dry-run
$R cut hotfix --target origin/release-vscode-0-86
```

`cut hotfix` publishes the next Stable patch (`vscode@0.86.1` by default). Its release notes list the cherry-picked commits since the latest Stable tag, and it runs the same `livekit-cf` drift and compatibility checks as `promote`. If the hotfix touches `livekit` / `vscode-webui`, either deploy from the hotfix branch (`$R deploy-livekit --ref release-vscode-0-86 --wait`) or pass `--skip-livekit-check` if `livekit-cf` was already deployed from a newer `main` commit; confirm with the user first.
*(Delete the temporary `release-vscode-0-86` branch after the fix is also on `main` and superseded by the next regular release.)*
