#!/usr/bin/env node
// CLI helper for Pochi VS Code rolling releases.
//
// Commands:
//   node .agents/skills/release-vscode/scripts/release.mjs status [--target <ref>] [--find-green] [--no-fetch] [--json]
//   node .agents/skills/release-vscode/scripts/release.mjs notes  --from <tag> [--to <ref>] [--version <X.Y.Z>]
//   node .agents/skills/release-vscode/scripts/release.mjs deploy-livekit [--ref <branch>] [--wait] [--dry-run]
//   node .agents/skills/release-vscode/scripts/release.mjs bump-dev [--version <X.Y.Z-dev>] [--dry-run] [--no-fetch]
//   node .agents/skills/release-vscode/scripts/release.mjs cut <prerelease|promote|rollback|hotfix>
//        [--target <ref>] [--version <X.Y.Z>] [--dry-run] [--no-watch] [--no-bump-dev] [--no-fetch]
//        [--skip-livekit-check] [--allow-unverified-ci] [--force]
//
// Options are parsed strictly: unknown or misspelled options are rejected.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CUT_MODES,
  compareVersions,
  computeReleaseState,
  detectLivekitDrift,
  evaluateCiGates,
  evaluateDevVersionSync,
  generateReleaseNotes,
  parseCliArgs,
  parseVscodeVersion,
  replaceVscodeDevVersion,
  requiredChecksForMode,
  requiredChecksForRef,
  scanCompatibilityRisks,
  workflowSupportsTagVersion,
} from "./lib.mjs";

const RELEASE_WORKFLOW_PATH =
  ".github/workflows/release-pochi-vscode-extension.yml";

const REPO = process.env.POCHI_GITHUB_REPO || "TabbyML/pochi";

function run(cmd, args, { allowFail = false, input, env } = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      input,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: [input !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    if (allowFail) return null;
    const stderr = err.stderr ? String(err.stderr).trim() : err.message;
    throw new Error(`${cmd} ${args.join(" ")} failed: ${stderr}`);
  }
}

function fetchOrigin(targetRef = null) {
  run("git", ["fetch", "origin", "main", "--tags", "--quiet"]);
  if (typeof targetRef === "string" && targetRef.startsWith("origin/")) {
    const branch = targetRef.slice("origin/".length);
    if (branch && branch !== "main") {
      run("git", [
        "fetch",
        "origin",
        `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
        "--quiet",
      ]);
    }
  }
}

function resolveCommit(ref, { allowFetch = true } = {}) {
  let sha = run("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
    allowFail: true,
  });
  if (!sha && allowFetch && /^[0-9a-f]{7,40}$/i.test(ref)) {
    ensureCommitAvailable(ref);
    sha = run("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
      allowFail: true,
    });
  }
  if (!sha) {
    throw new Error(`Cannot resolve git commit for '${ref}'`);
  }
  return sha;
}

function listVscodeTags() {
  const out = run("git", [
    "for-each-ref",
    "refs/tags/vscode@*",
    "--format=%(refname:short)\t%(objectname)\t%(*objectname)",
  ]);
  if (!out) return [];
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [tag, objSha, peeledSha] = line.split("\t");
      return { tag, commitSha: peeledSha || objSha };
    });
}

function getCommitsBetween(fromRef, toSha) {
  if (!fromRef) return [];
  const base =
    run("git", ["merge-base", `${fromRef}^{commit}`, toSha], {
      allowFail: true,
    }) || `${fromRef}^{commit}`;
  const out = run("git", [
    "log",
    "--no-merges",
    "--format=%H\t%s",
    `${base}..${toSha}`,
  ]);
  if (!out) return [];
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      return { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
    });
}

function getChangedFilesBetween(fromRef, toSha) {
  if (!fromRef) return [];
  const base =
    run("git", ["merge-base", `${fromRef}^{commit}`, toSha], {
      allowFail: true,
    }) || `${fromRef}^{commit}`;
  // Throws when either side is missing locally, so callers never mistake an
  // unresolvable diff for "no changes".
  const out = run("git", ["diff", "--name-only", `${base}..${toSha}`]);
  if (!out) return [];
  return out.split("\n").filter(Boolean);
}

function hasCommit(ref) {
  return (
    run("git", ["cat-file", "-e", `${ref}^{commit}`], { allowFail: true }) !==
    null
  );
}

/**
 * Make sure `sha` exists locally. `fetchOrigin()` only fetches `main` and tags,
 * so commits from other branches or shallow clones may need an explicit fetch.
 */
function ensureCommitAvailable(sha) {
  if (hasCommit(sha)) return true;
  run("git", ["fetch", "origin", sha, "--quiet"], { allowFail: true });
  return hasCommit(sha);
}

function getCheckRuns(sha) {
  const out = run(
    "gh",
    [
      "api",
      `repos/${REPO}/commits/${sha}/check-runs?per_page=100`,
      "--jq",
      ".check_runs | map({name, status, conclusion, html_url})",
    ],
    { allowFail: true },
  );
  if (!out) return [];
  try {
    return JSON.parse(out);
  } catch {
    return [];
  }
}

function findLatestGreenMainCommit(limit = 10) {
  const out = run("git", ["rev-list", "-n", String(limit), "origin/main"]);
  const shas = out ? out.split("\n").filter(Boolean) : [];
  for (const sha of shas) {
    const gate = evaluateCiGates(getCheckRuns(sha));
    if (gate.ok) {
      const subject = run("git", ["log", "-1", "--format=%s", sha]);
      return { sha, subject, gate };
    }
  }
  return null;
}

function getLivekitStatus(targetSha, fallbackBaseTag) {
  const out = run(
    "gh",
    [
      "run",
      "list",
      "--repo",
      REPO,
      "--workflow=deploy-livekit-cf.yml",
      "--status=success",
      "-L",
      "1",
      "--json",
      "databaseId,headSha,createdAt,url",
    ],
    { allowFail: true },
  );
  let lastDeploy = null;
  if (out) {
    try {
      const parsed = JSON.parse(out);
      lastDeploy = parsed[0] ?? null;
    } catch {
      lastDeploy = null;
    }
  }
  const compareBase = lastDeploy?.headSha || fallbackBaseTag;
  // Fail closed: if the drift cannot be computed, report that a deploy may be
  // needed instead of claiming the worker is up to date.
  const unknown = (reason) => ({
    lastDeploy,
    compareBase,
    unknown: true,
    reason,
    needsDeploy: true,
    packages: [],
    fileCount: 0,
    sampleFiles: [],
  });
  if (!compareBase) {
    return unknown("no previous deploy-livekit-cf run or release tag found");
  }
  if (!ensureCommitAvailable(compareBase)) {
    return unknown(
      `cannot resolve last deploy commit ${compareBase.slice(0, 7)} locally`,
    );
  }
  let changed;
  try {
    changed = getChangedFilesBetween(compareBase, targetSha);
  } catch (err) {
    return unknown(err.message);
  }
  return {
    lastDeploy,
    compareBase,
    unknown: false,
    reason: null,
    ...detectLivekitDrift(changed),
  };
}

function describeLivekitDrift(livekit) {
  if (livekit.unknown) {
    return `UNKNOWN (${livekit.reason}); treat as NEEDS DEPLOY`;
  }
  return livekit.needsDeploy
    ? `NEEDS DEPLOY (${livekit.fileCount} files in ${livekit.packages.join(", ")})`
    : "up to date";
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function getMainPackageVersion() {
  const raw =
    run("git", ["show", "origin/main:packages/vscode/package.json"], {
      allowFail: true,
    }) ??
    run("git", ["show", "HEAD:packages/vscode/package.json"], {
      allowFail: true,
    });
  if (!raw) return null;
  try {
    return JSON.parse(raw).version ?? null;
  } catch {
    return null;
  }
}

function cmdStatus(flags) {
  const targetRef =
    typeof flags.target === "string" ? flags.target : "origin/main";
  const allowFetch = !flags["no-fetch"];
  if (allowFetch) fetchOrigin(targetRef);
  const targetSha = resolveCommit(targetRef, { allowFetch });
  const targetSubject = run("git", ["log", "-1", "--format=%s", targetSha]);
  const state = computeReleaseState(listVscodeTags());
  const devVersionSync = evaluateDevVersionSync(
    getMainPackageVersion(),
    state.nextDevVersion,
  );

  const diffBaseTag = state.latestTag?.tag ?? null;
  const unreleasedCommits = getCommitsBetween(diffBaseTag, targetSha);
  const filesSinceStable = getChangedFilesBetween(
    state.latestStable?.tag ?? diffBaseTag,
    targetSha,
  );
  const requiredChecks = requiredChecksForRef(targetRef);
  const ciGate = evaluateCiGates(getCheckRuns(targetSha), requiredChecks);
  const livekit = getLivekitStatus(
    targetSha,
    state.latestStable?.tag ?? diffBaseTag,
  );
  const risks = scanCompatibilityRisks(filesSinceStable);
  const fallbackGreen =
    !ciGate.ok && flags["find-green"] ? findLatestGreenMainCommit(10) : null;

  const report = {
    targetRef,
    targetSha,
    targetSubject,
    state,
    devVersionSync,
    unreleasedCount: unreleasedCommits.length,
    unreleasedCommits,
    ciGate,
    fallbackGreen,
    livekit,
    risks,
  };

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("=== Pochi VS Code Release Status ===");
  console.log(
    `Latest Stable     : ${state.latestStable ? `${state.latestStable.tag} (${state.latestStable.commitSha.slice(0, 7)})` : "none"}`,
  );
  console.log(
    `Previous Stable   : ${state.previousStable ? `${state.previousStable.tag} (${state.previousStable.commitSha.slice(0, 7)})` : "none"}`,
  );
  console.log(
    `Active Pre-release: ${state.activePrerelease ? `${state.activePrerelease.tag} (${state.activePrerelease.commitSha.slice(0, 7)})` : "none (currently on even stable cycle)"}`,
  );
  console.log(
    `Main package.json : ${devVersionSync.currentVersion ?? "unknown"}${devVersionSync.needsBump ? ` -> behind ${devVersionSync.expectedVersion} (run 'release.mjs bump-dev')` : " (in sync)"}`,
  );
  console.log(
    `Target (${targetRef}) : ${targetSha.slice(0, 7)} — ${targetSubject}`,
  );
  console.log("");
  console.log("Next calculated versions:");
  console.log(`  prerelease -> vscode@${state.nextVersions.prerelease}`);
  console.log(
    `  promote    -> vscode@${state.nextVersions.promote}${state.activePrerelease ? ` (default target: ${state.activePrerelease.commitSha.slice(0, 7)})` : ""}`,
  );
  if (state.nextVersions.rollback && state.previousStable) {
    console.log(
      `  rollback   -> vscode@${state.nextVersions.rollback} (restores ${state.previousStable.tag} @ ${state.previousStable.commitSha.slice(0, 7)})`,
    );
  }
  if (state.nextVersions.hotfix) {
    console.log(
      `  hotfix     -> vscode@${state.nextVersions.hotfix} (requires --target <hotfix branch>)`,
    );
  }

  console.log("");
  console.log(
    `CI Gates on ${targetSha.slice(0, 7)}: ${ciGate.ok ? "PASS" : "BLOCKED"}`,
  );
  for (const r of ciGate.results) {
    console.log(
      `  [${r.passed ? "OK" : "FAIL"}] ${r.name}: ${r.state}${r.details ? ` (${r.details})` : ""}`,
    );
  }
  if (fallbackGreen) {
    console.log(
      `  -> Nearest green origin/main commit: ${fallbackGreen.sha.slice(0, 7)} (${fallbackGreen.subject})`,
    );
  }

  console.log("");
  console.log(`Cloudflare livekit-cf: ${describeLivekitDrift(livekit)}`);
  if (livekit.lastDeploy) {
    console.log(
      `  Last deploy: ${livekit.lastDeploy.headSha.slice(0, 7)} at ${livekit.lastDeploy.createdAt}`,
    );
  }

  if (risks.length > 0) {
    console.log("");
    console.log("Compatibility & Rollback Warnings:");
    for (const w of risks) {
      console.log(`  [${w.severity.toUpperCase()}] (${w.kind}) ${w.message}`);
      console.log(
        `    Files: ${w.files.slice(0, 5).join(", ")}${w.files.length > 5 ? " ..." : ""}`,
      );
    }
  }

  console.log("");
  console.log(
    `Unreleased commits since ${diffBaseTag ?? "beginning"} (${unreleasedCommits.length}):`,
  );
  if (unreleasedCommits.length === 0) {
    console.log("  (none)");
  } else {
    for (const c of unreleasedCommits.slice(0, 25)) {
      console.log(`  ${c.sha.slice(0, 7)} ${c.subject}`);
    }
    if (unreleasedCommits.length > 25) {
      console.log(`  ... and ${unreleasedCommits.length - 25} more`);
    }
  }
}

function cmdNotes(flags) {
  const fromTag = flags.from;
  if (typeof fromTag !== "string") {
    throw new Error(
      "Usage: release.mjs notes --from <baseTag> [--to <ref>] [--version <X.Y.Z>]",
    );
  }
  const toRef = typeof flags.to === "string" ? flags.to : "origin/main";
  const toSha = resolveCommit(toRef);
  const toTag =
    typeof flags.version === "string"
      ? `vscode@${flags.version.replace(/^vscode@/, "")}`
      : toRef;
  const commits = getCommitsBetween(fromTag, toSha);
  process.stdout.write(
    generateReleaseNotes({ commits, fromTag, toTag, repo: REPO }),
  );
}

function parseJsonSafe(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cmdDeployLivekit(flags) {
  const ref =
    typeof flags.ref === "string" ? flags.ref.replace(/^origin\//, "") : "main";
  if (flags["dry-run"]) {
    console.log(
      `[dry-run] Would run: gh workflow run deploy-livekit-cf.yml --repo ${REPO} --ref ${ref}`,
    );
    return;
  }
  const before = run(
    "gh",
    [
      "run",
      "list",
      "--repo",
      REPO,
      "--workflow=deploy-livekit-cf.yml",
      "-L",
      "1",
      "--json",
      "databaseId",
    ],
    { allowFail: true },
  );
  const prevId = parseJsonSafe(before)?.[0]?.databaseId ?? null;

  console.log(`Triggering deploy-livekit-cf.yml on ${ref}...`);
  run("gh", [
    "workflow",
    "run",
    "deploy-livekit-cf.yml",
    "--repo",
    REPO,
    "--ref",
    ref,
  ]);

  let runId = null;
  for (let attempt = 0; attempt < 15; attempt++) {
    sleepMs(2000);
    const listOut = run(
      "gh",
      [
        "run",
        "list",
        "--repo",
        REPO,
        "--workflow=deploy-livekit-cf.yml",
        "-L",
        "1",
        "--json",
        "databaseId,url",
      ],
      { allowFail: true },
    );
    const latest = parseJsonSafe(listOut)?.[0];
    if (latest && latest.databaseId !== prevId) {
      runId = latest.databaseId;
      console.log(`Started deploy-livekit-cf run ${runId}: ${latest.url}`);
      break;
    }
  }

  if (!runId) {
    const message =
      "Could not find the triggered deploy-livekit-cf run within 30s. Check GitHub Actions manually.";
    // With --wait the caller relies on the deploy having finished, so never
    // exit 0 without having watched the run.
    if (flags.wait) throw new Error(message);
    console.warn(`Warning: ${message}`);
    return;
  }

  if (flags.wait) {
    const res = spawnSync(
      "gh",
      ["run", "watch", String(runId), "--repo", REPO, "--exit-status"],
      { stdio: "inherit" },
    );
    if (res.status !== 0) {
      throw new Error(`deploy-livekit-cf run ${runId} failed`);
    }
  }
}

/**
 * Open an auto-merge PR updating `packages/vscode/package.json` (and `bun.lock`)
 * on `main` to the active `X.Y.0-dev` version. Uses a temporary git index so
 * the caller's working tree and checked-out branch are never touched.
 */
function bumpDevVersion({ version, dryRun = false, noFetch = false }) {
  if (!noFetch) fetchOrigin();
  const state = computeReleaseState(listVscodeTags());
  const nextDevVersion =
    typeof version === "string" ? version : state.nextDevVersion;

  const pkgJsonText = run("git", [
    "show",
    "origin/main:packages/vscode/package.json",
  ]);
  const bunLockText = run("git", ["show", "origin/main:bun.lock"], {
    allowFail: true,
  });
  const currentVersion = JSON.parse(pkgJsonText).version ?? null;
  const sync = evaluateDevVersionSync(currentVersion, nextDevVersion);

  if (!sync.needsBump && typeof version !== "string") {
    console.log(
      `packages/vscode/package.json on origin/main is already at ${currentVersion} (expected ${sync.expectedVersion}); skipping dev version bump.`,
    );
    return { skipped: true, version: sync.expectedVersion };
  }

  const updated = replaceVscodeDevVersion({
    pkgJsonText,
    bunLockText,
    nextDevVersion: sync.expectedVersion,
  });
  const branchName = `chore/bump-vscode-${sync.expectedVersion}`;
  const commitTitle = `chore(vscode): bump version to ${sync.expectedVersion}`;

  const existingPrOut = run(
    "gh",
    [
      "pr",
      "list",
      "--repo",
      REPO,
      "--head",
      branchName,
      "--state",
      "open",
      "--json",
      "number,url",
    ],
    { allowFail: true },
  );
  const existingPr = parseJsonSafe(existingPrOut)?.[0];
  if (existingPr) {
    console.log(
      `Open dev-version bump PR already exists (#${existingPr.number}): ${existingPr.url}`,
    );
    return { skipped: true, prUrl: existingPr.url };
  }

  if (dryRun) {
    console.log(
      `[dry-run] Would push ${branchName} and open auto-merge PR: "${commitTitle}" (${currentVersion} -> ${sync.expectedVersion})`,
    );
    return { dryRun: true, version: sync.expectedVersion };
  }

  const baseSha = resolveCommit("origin/main", { allowFetch: false });
  const tmpIndex = path.join(
    os.tmpdir(),
    `pochi-bump-dev-index-${process.pid}-${Date.now()}`,
  );
  let commitSha;
  try {
    const indexEnv = { GIT_INDEX_FILE: tmpIndex };
    run("git", ["read-tree", baseSha], { env: indexEnv });
    const pkgBlob = run("git", ["hash-object", "-w", "--stdin"], {
      input: updated.pkgJsonText,
    });
    run(
      "git",
      [
        "update-index",
        "--cacheinfo",
        `100644,${pkgBlob},packages/vscode/package.json`,
      ],
      { env: indexEnv },
    );
    if (updated.bunLockText !== null && updated.bunLockText !== bunLockText) {
      const lockBlob = run("git", ["hash-object", "-w", "--stdin"], {
        input: updated.bunLockText,
      });
      run(
        "git",
        ["update-index", "--cacheinfo", `100644,${lockBlob},bun.lock`],
        { env: indexEnv },
      );
    }
    const treeSha = run("git", ["write-tree"], { env: indexEnv });
    commitSha = run("git", [
      "commit-tree",
      treeSha,
      "-p",
      baseSha,
      "-m",
      commitTitle,
    ]);
  } finally {
    fs.rmSync(tmpIndex, { force: true });
  }

  run("git", [
    "push",
    "--no-verify",
    "origin",
    `+${commitSha}:refs/heads/${branchName}`,
  ]);

  const prBody = [
    "## Summary",
    `- Bump \`packages/vscode/package.json\` version from \`${currentVersion}\` to \`${sync.expectedVersion}\` for the next development cycle${state.latestStable ? ` following \`${state.latestStable.tag}\`` : ""}.`,
  ].join("\n");

  const prUrl = run("gh", [
    "pr",
    "create",
    "--repo",
    REPO,
    "--base",
    "main",
    "--head",
    branchName,
    "--title",
    commitTitle,
    "--body",
    prBody,
  ]);
  console.log(`Opened dev-version bump PR: ${prUrl}`);

  const autoMerged =
    run(
      "gh",
      [
        "pr",
        "merge",
        prUrl,
        "--repo",
        REPO,
        "--auto",
        "--squash",
        "--delete-branch",
      ],
      { allowFail: true },
    ) ??
    run("gh", ["pr", "merge", prUrl, "--repo", REPO, "--auto"], {
      allowFail: true,
    });
  if (autoMerged !== null) {
    console.log(`Enabled auto-merge on ${prUrl}`);
  } else {
    console.warn(
      `Could not enable auto-merge automatically; merge ${prUrl} once checks pass.`,
    );
  }
  return { skipped: false, prUrl, version: sync.expectedVersion };
}

function cmdBumpDev(flags) {
  bumpDevVersion({
    version: flags.version,
    dryRun: Boolean(flags["dry-run"]),
    noFetch: Boolean(flags["no-fetch"]),
  });
}

function cmdCut(mode, flags) {
  if (!CUT_MODES.includes(mode)) {
    throw new Error(
      `Unknown cut mode '${mode}'. Expected ${CUT_MODES.join(" | ")}`,
    );
  }
  const allowFetch = !flags["no-fetch"];
  if (allowFetch) fetchOrigin(flags.target);

  const state = computeReleaseState(listVscodeTags());
  const rawVersion =
    typeof flags.version === "string"
      ? flags.version
      : state.nextVersions[mode];
  if (!rawVersion) {
    throw new Error(`Cannot determine next version for mode '${mode}'`);
  }
  const versionInfo = parseVscodeVersion(rawVersion);
  if (!versionInfo) {
    throw new Error(
      `Invalid version '${rawVersion}'. VS Marketplace requires strict major.minor.patch integers.`,
    );
  }

  const expectedChannel = mode === "prerelease" ? "prerelease" : "stable";
  if (versionInfo.channel !== expectedChannel) {
    throw new Error(
      `Mode '${mode}' requires ${expectedChannel} (${expectedChannel === "prerelease" ? "odd" : "even"} minor), got ${versionInfo.version}`,
    );
  }

  if (!flags.force) {
    if (
      state.latestStable &&
      compareVersions(versionInfo, state.latestStable) <= 0
    ) {
      throw new Error(
        `Version ${versionInfo.version} must be greater than latest Stable ${state.latestStable.version}. Pass --force to override.`,
      );
    }
    if (
      mode === "prerelease" &&
      state.latestTag &&
      compareVersions(versionInfo, state.latestTag) <= 0
    ) {
      throw new Error(
        `Version ${versionInfo.version} must be greater than latest tag ${state.latestTag.version}. Pass --force to override.`,
      );
    }
  }

  let targetSha;
  let notesBaseTag;
  let rollbackFromTag = null;

  if (mode === "prerelease") {
    const ref = typeof flags.target === "string" ? flags.target : "origin/main";
    targetSha = resolveCommit(ref, { allowFetch });
    notesBaseTag = state.latestTag?.tag ?? null;
    if (
      state.latestTag &&
      (state.latestTag.commitSha === targetSha ||
        getCommitsBetween(notesBaseTag, targetSha).length === 0) &&
      !flags.force
    ) {
      throw new Error(
        `No unreleased commits between ${state.latestTag.tag} and ${targetSha.slice(0, 7)}. Pass --force to tag anyway.`,
      );
    }
  } else if (mode === "promote") {
    if (typeof flags.target === "string") {
      targetSha = resolveCommit(flags.target, { allowFetch });
    } else if (state.activePrerelease) {
      targetSha = state.activePrerelease.commitSha;
    } else {
      throw new Error(
        "No active pre-release tag newer than latest Stable. Run 'cut prerelease' first or pass --target <sha> explicitly.",
      );
    }
    notesBaseTag = state.latestStable?.tag ?? state.latestTag?.tag ?? null;
    if (
      state.latestStable &&
      (state.latestStable.commitSha === targetSha ||
        getCommitsBetween(notesBaseTag, targetSha).length === 0) &&
      !flags.force
    ) {
      throw new Error(
        `No unreleased commits between ${state.latestStable.tag} and ${targetSha.slice(0, 7)}. Pass --force to tag anyway.`,
      );
    }
  } else if (mode === "rollback") {
    // Rollback only re-publishes the build of an existing release tag. Shipping
    // new commits (e.g. a cherry-picked fix) must go through `cut hotfix` so the
    // release notes, livekit drift, and compatibility checks cover them.
    if (typeof flags.target === "string") {
      const targetInfo = parseVscodeVersion(flags.target);
      if (!targetInfo || !run("git", ["tag", "-l", targetInfo.tag])) {
        throw new Error(
          `Rollback --target must be an existing vscode@X.Y.Z release tag (got '${flags.target}'). To ship new commits, use 'cut hotfix --target <ref>'.`,
        );
      }
      if (targetInfo.channel !== "stable" && !flags.force) {
        throw new Error(
          `Rollback --target ${targetInfo.tag} is a pre-release tag. Expected an even-minor Stable tag (or pass --force).`,
        );
      }
      targetSha = resolveCommit(targetInfo.tag, { allowFetch: false });
      rollbackFromTag = targetInfo.tag;
    } else if (state.previousStable) {
      targetSha = state.previousStable.commitSha;
      rollbackFromTag = state.previousStable.tag;
    } else {
      throw new Error("No previous Stable tag found to roll back to.");
    }
    if (
      state.latestStable &&
      targetSha === state.latestStable.commitSha &&
      !flags.force
    ) {
      throw new Error(
        `Rollback target ${rollbackFromTag} points to the same commit (${targetSha.slice(0, 7)}) as latest Stable ${state.latestStable.tag}.`,
      );
    }
    notesBaseTag = state.latestStable?.tag ?? null;
  } else {
    // hotfix: ship a branch based on the latest Stable tag with cherry-picked fixes.
    if (typeof flags.target !== "string") {
      throw new Error(
        "Mode 'hotfix' requires --target <ref> (e.g. origin/release-vscode-0-86).",
      );
    }
    if (!state.latestStable) {
      throw new Error(
        "No Stable tag found to base the hotfix release notes on.",
      );
    }
    targetSha = resolveCommit(flags.target, { allowFetch });
    notesBaseTag = state.latestStable.tag;
    if (
      getCommitsBetween(notesBaseTag, targetSha).length === 0 &&
      !flags.force
    ) {
      throw new Error(
        `No new commits between ${notesBaseTag} and ${flags.target}. Pass --force to tag anyway.`,
      );
    }
  }

  // Every tag push runs the release workflow as committed at the tagged commit.
  // Targets that predate tag-version injection would publish the version
  // hardcoded in their packages/vscode/package.json instead of the tag version.
  const workflowContent = run(
    "git",
    ["show", `${targetSha}:${RELEASE_WORKFLOW_PATH}`],
    { allowFail: true },
  );
  if (!workflowSupportsTagVersion(workflowContent ?? "")) {
    const label = rollbackFromTag ?? flags.target ?? "target";
    throw new Error(
      `Target ${targetSha.slice(0, 7)} (${label}) predates tag-version injection in ${RELEASE_WORKFLOW_PATH}; pushing ${versionInfo.tag} would publish the version hardcoded in its packages/vscode/package.json. Use a target that contains the workflow change (for a legacy Stable, cut a hotfix branch from it and cherry-pick the workflow change).`,
    );
  }

  const existingLocal = run("git", ["tag", "-l", versionInfo.tag]);
  const existingRemote = run(
    "git",
    ["ls-remote", "--tags", "origin", `refs/tags/${versionInfo.tag}`],
    { allowFail: true },
  );
  if (existingLocal || existingRemote) {
    throw new Error(`Tag ${versionInfo.tag} already exists!`);
  }

  const requiredChecks = requiredChecksForMode(mode);
  const ciGate = evaluateCiGates(getCheckRuns(targetSha), requiredChecks);
  if (!ciGate.ok && !flags["allow-unverified-ci"]) {
    const summary = ciGate.results
      .map((r) => `${r.name}=${r.state}`)
      .join(", ");
    throw new Error(
      `CI gate failed for ${targetSha.slice(0, 7)} (${summary}). Wait for checks or pick a green commit (status --find-green).`,
    );
  }

  if (mode !== "rollback") {
    const livekit = getLivekitStatus(targetSha, notesBaseTag);
    if (livekit.needsDeploy && !flags["skip-livekit-check"]) {
      if (mode === "hotfix") {
        const hotfixRef = String(flags.target).replace(/^origin\//, "");
        throw new Error(
          `Cloudflare livekit-cf: ${describeLivekitDrift(livekit)}. Run 'release.mjs deploy-livekit --ref ${hotfixRef} --wait' to deploy from the hotfix branch, or pass --skip-livekit-check if livekit-cf was already deployed from a newer main commit.`,
        );
      }
      throw new Error(
        `Cloudflare livekit-cf: ${describeLivekitDrift(livekit)}. Run 'release.mjs deploy-livekit --wait' first, or pass --skip-livekit-check.`,
      );
    }
  }

  const changedFiles =
    mode === "rollback"
      ? []
      : getChangedFilesBetween(
          state.latestStable?.tag ?? notesBaseTag,
          targetSha,
        );
  const risks = scanCompatibilityRisks(changedFiles);
  const commits =
    mode === "rollback" ? [] : getCommitsBetween(notesBaseTag, targetSha);
  const notes = generateReleaseNotes({
    commits,
    fromTag: notesBaseTag,
    toTag: versionInfo.tag,
    repo: REPO,
    rollbackFromTag,
  });

  console.log(`=== Release Plan (${mode.toUpperCase()}) ===`);
  console.log(`Tag          : ${versionInfo.tag} (${versionInfo.channel})`);
  console.log(`Target SHA   : ${targetSha}`);
  console.log(`Notes Base   : ${notesBaseTag ?? "none"}`);
  console.log(
    `CI Gates     : ${ciGate.ok ? "PASS" : "BYPASSED (--allow-unverified-ci)"} (${requiredChecks.join(", ")})`,
  );
  if (risks.length > 0) {
    console.log("Risk Warnings:");
    for (const w of risks) {
      console.log(`  - [${w.severity.toUpperCase()}] ${w.message}`);
    }
  }
  console.log("\n--- Generated Release Notes ---");
  process.stdout.write(notes);
  console.log("-------------------------------\n");

  if (flags["dry-run"]) {
    if (mode === "promote" && !flags["no-bump-dev"]) {
      const nextDev = `${versionInfo.major}.${versionInfo.minor + 1}.0-dev`;
      console.log(
        `[dry-run] After promote, would open auto-merge PR bumping packages/vscode/package.json to ${nextDev}.`,
      );
    }
    console.log(
      "[dry-run] Pre-flight checks passed. No tag created or pushed.",
    );
    return;
  }

  run("git", [
    "tag",
    "-a",
    versionInfo.tag,
    targetSha,
    "-m",
    `Release ${versionInfo.tag}`,
  ]);
  console.log(
    `Created annotated tag ${versionInfo.tag} -> ${targetSha.slice(0, 7)}`,
  );
  try {
    run("git", ["push", "--no-verify", "origin", versionInfo.tag]);
  } catch (err) {
    // Drop the local tag so a retry is not blocked by "already exists".
    run("git", ["tag", "-d", versionInfo.tag], { allowFail: true });
    throw new Error(
      `${err.message}\nDeleted local tag ${versionInfo.tag}; fix the push problem and rerun.`,
    );
  }
  console.log(`Pushed ${versionInfo.tag} to origin.`);

  if (flags["no-watch"]) {
    console.warn(
      `Note: --no-watch was passed, so GitHub Release notes were not applied automatically. Once the workflow finishes, update notes with 'gh release edit ${versionInfo.tag} --repo ${REPO} --notes-file <file>' (use 'release.mjs notes --from ${notesBaseTag ?? "<baseTag>"} --to ${versionInfo.tag} --version ${versionInfo.version}').`,
    );
    if (mode === "promote" && !flags["no-bump-dev"]) {
      console.warn(
        "Run 'release.mjs bump-dev' once ready to bump packages/vscode/package.json for the next cycle.",
      );
    }
    return;
  }

  console.log("Waiting for Release Pochi VSCode Extension workflow run...");
  let runId = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    sleepMs(3000);
    const listOut = run(
      "gh",
      [
        "run",
        "list",
        "--repo",
        REPO,
        "--workflow=release-pochi-vscode-extension.yml",
        "-L",
        "5",
        "--json",
        "databaseId,headBranch,url",
      ],
      { allowFail: true },
    );
    if (!listOut) continue;
    const match = JSON.parse(listOut).find(
      (r) => r.headBranch === versionInfo.tag,
    );
    if (match) {
      runId = match.databaseId;
      console.log(`Watching release workflow ${runId}: ${match.url}`);
      break;
    }
  }

  if (!runId) {
    throw new Error(
      `Could not find release workflow run for ${versionInfo.tag}. Check GitHub Actions manually.`,
    );
  }

  const watchRes = spawnSync(
    "gh",
    ["run", "watch", String(runId), "--repo", REPO, "--exit-status"],
    { stdio: "inherit" },
  );
  if (watchRes.status !== 0) {
    throw new Error(`Release workflow ${runId} failed for ${versionInfo.tag}`);
  }

  const tmpNotes = path.join(
    os.tmpdir(),
    `pochi-release-notes-${versionInfo.version}.md`,
  );
  fs.writeFileSync(tmpNotes, notes, "utf8");
  try {
    run("gh", [
      "release",
      "edit",
      versionInfo.tag,
      "--repo",
      REPO,
      "--notes-file",
      tmpNotes,
    ]);
    console.log(`Updated GitHub Release notes for ${versionInfo.tag}.`);
  } finally {
    fs.rmSync(tmpNotes, { force: true });
  }

  const releaseUrl = run("gh", [
    "release",
    "view",
    versionInfo.tag,
    "--repo",
    REPO,
    "--json",
    "url",
    "-q",
    ".url",
  ]);
  console.log(`Release complete: ${releaseUrl}`);

  if (mode === "promote" && !flags["no-bump-dev"]) {
    try {
      bumpDevVersion({ dryRun: false, noFetch: false });
    } catch (err) {
      console.warn(
        `Warning: Stable release succeeded, but opening the follow-up dev-version bump PR failed: ${err.message}\nRun 'node .agents/skills/release-vscode/scripts/release.mjs bump-dev' to retry.`,
      );
    }
  }
}

function main() {
  const { command, args, flags, help } = parseCliArgs(process.argv.slice(2));
  if (help) {
    console.log(
      [
        "Usage: node .agents/skills/release-vscode/scripts/release.mjs <command> [options]",
        "",
        "Commands:",
        "  status [--target <ref>] [--find-green] [--no-fetch] [--json]",
        "  notes --from <tag> [--to <ref>] [--version <X.Y.Z>]",
        "  deploy-livekit [--ref <branch>] [--wait] [--dry-run]",
        "  bump-dev [--version <X.Y.Z-dev>] [--dry-run] [--no-fetch]",
        "  cut <prerelease|promote|rollback|hotfix> [--target <ref>] [--version <X.Y.Z>]",
        "      [--dry-run] [--no-watch] [--no-bump-dev] [--no-fetch] [--skip-livekit-check]",
        "      [--allow-unverified-ci] [--force]",
      ].join("\n"),
    );
    return;
  }

  if (command === "status") return cmdStatus(flags);
  if (command === "notes") return cmdNotes(flags);
  if (command === "deploy-livekit") return cmdDeployLivekit(flags);
  if (command === "bump-dev") return cmdBumpDev(flags);
  if (command === "cut") return cmdCut(args[0], flags);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
