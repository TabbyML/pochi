#!/usr/bin/env node
// CLI helper for Pochi VS Code rolling releases.
//
// Commands:
//   node .agents/skills/release-vscode/scripts/release.mjs status [--target <ref>] [--find-green] [--no-fetch] [--json]
//   node .agents/skills/release-vscode/scripts/release.mjs notes  --from <tag> [--to <ref>] [--version <X.Y.Z>]
//   node .agents/skills/release-vscode/scripts/release.mjs deploy-livekit [--wait] [--dry-run]
//   node .agents/skills/release-vscode/scripts/release.mjs cut <prerelease|promote|rollback>
//        [--target <ref>] [--version <X.Y.Z>] [--dry-run] [--no-watch]
//        [--skip-livekit-check] [--allow-unverified-ci] [--force]

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  computeReleaseState,
  detectLivekitDrift,
  evaluateCiGates,
  generateReleaseNotes,
  parseVscodeVersion,
  scanCompatibilityRisks,
  workflowSupportsTagVersion,
} from "./lib.mjs";

const REPO = process.env.POCHI_GITHUB_REPO || "TabbyML/pochi";

function run(cmd, args, { allowFail = false } = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    if (allowFail) return null;
    const stderr = err.stderr ? String(err.stderr).trim() : err.message;
    throw new Error(`${cmd} ${args.join(" ")} failed: ${stderr}`);
  }
}

function parseFlags(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { positional, flags };
}

function fetchOrigin() {
  run("git", ["fetch", "origin", "main", "--tags", "--quiet"]);
}

function resolveCommit(ref) {
  const sha = run("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
    allowFail: true,
  });
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
  const out = run("git", ["diff", "--name-only", `${base}..${toSha}`], {
    allowFail: true,
  });
  if (!out) return [];
  return out.split("\n").filter(Boolean);
}

function getCheckRuns(sha) {
  const out = run(
    "gh",
    [
      "api",
      `repos/${REPO}/commits/${sha}/check-runs`,
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
  const changed = compareBase
    ? getChangedFilesBetween(compareBase, targetSha)
    : [];
  return {
    lastDeploy,
    compareBase,
    ...detectLivekitDrift(changed),
  };
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function cmdStatus(flags) {
  if (!flags["no-fetch"]) fetchOrigin();
  const targetRef =
    typeof flags.target === "string" ? flags.target : "origin/main";
  const targetSha = resolveCommit(targetRef);
  const targetSubject = run("git", ["log", "-1", "--format=%s", targetSha]);
  const state = computeReleaseState(listVscodeTags());

  const diffBaseTag = state.latestTag?.tag ?? null;
  const unreleasedCommits = getCommitsBetween(diffBaseTag, targetSha);
  const filesSinceStable = getChangedFilesBetween(
    state.latestStable?.tag ?? diffBaseTag,
    targetSha,
  );
  const ciGate = evaluateCiGates(getCheckRuns(targetSha));
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
  console.log(
    `Cloudflare livekit-cf: ${livekit.needsDeploy ? `NEEDS DEPLOY (${livekit.fileCount} files in ${livekit.packages.join(", ")})` : "up to date"}`,
  );
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

function cmdDeployLivekit(flags) {
  if (flags["dry-run"]) {
    console.log(
      `[dry-run] Would run: gh workflow run deploy-livekit-cf.yml --repo ${REPO} --ref main`,
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
  const prevId = before ? JSON.parse(before)[0]?.databaseId : null;

  console.log("Triggering deploy-livekit-cf.yml on main...");
  run("gh", [
    "workflow",
    "run",
    "deploy-livekit-cf.yml",
    "--repo",
    REPO,
    "--ref",
    "main",
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
    if (!listOut) continue;
    const latest = JSON.parse(listOut)[0];
    if (latest && latest.databaseId !== prevId) {
      runId = latest.databaseId;
      console.log(`Started deploy-livekit-cf run ${runId}: ${latest.url}`);
      break;
    }
  }

  if (flags.wait && runId) {
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

function cmdCut(mode, flags) {
  if (!["prerelease", "promote", "rollback"].includes(mode)) {
    throw new Error(
      `Unknown cut mode '${mode}'. Expected prerelease | promote | rollback`,
    );
  }
  if (!flags["no-fetch"]) fetchOrigin();

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

  let targetSha;
  let notesBaseTag;
  let rollbackFromTag = null;

  if (mode === "prerelease") {
    const ref = typeof flags.target === "string" ? flags.target : "origin/main";
    targetSha = resolveCommit(ref);
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
      targetSha = resolveCommit(flags.target);
    } else if (state.activePrerelease) {
      targetSha = state.activePrerelease.commitSha;
    } else {
      throw new Error(
        "No active pre-release tag newer than latest Stable. Run 'cut prerelease' first or pass --target <sha> explicitly.",
      );
    }
    notesBaseTag = state.latestStable?.tag ?? state.latestTag?.tag ?? null;
  } else {
    // rollback
    if (typeof flags.target === "string") {
      targetSha = resolveCommit(flags.target);
      rollbackFromTag = flags.target;
    } else if (state.previousStable) {
      targetSha = state.previousStable.commitSha;
      rollbackFromTag = state.previousStable.tag;
    } else {
      throw new Error("No previous Stable tag found to roll back to.");
    }
    notesBaseTag = state.latestStable?.tag ?? null;

    const wfContent = run(
      "git",
      [
        "show",
        `${targetSha}:.github/workflows/release-pochi-vscode-extension.yml`,
      ],
      { allowFail: true },
    );
    if (!workflowSupportsTagVersion(wfContent ?? "")) {
      throw new Error(
        `Rollback target ${targetSha.slice(0, 7)} (${rollbackFromTag}) predates dynamic tag-version injection in release-pochi-vscode-extension.yml. Re-tagging it would re-read its committed package.json version. Use a temporary hotfix branch instead.`,
      );
    }
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

  const ciGate = evaluateCiGates(getCheckRuns(targetSha));
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
      throw new Error(
        `Cloudflare livekit-cf has undeployed changes (${livekit.packages.join(", ")}). Run 'release.mjs deploy-livekit --wait' first, or pass --skip-livekit-check.`,
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
    `CI Gates     : ${ciGate.ok ? "PASS" : "BYPASSED (--allow-unverified-ci)"}`,
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
  run("git", ["push", "origin", versionInfo.tag]);
  console.log(`Pushed ${versionInfo.tag} to origin.`);

  if (flags["no-watch"]) return;

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
}

function main() {
  const { positional, flags } = parseFlags(process.argv.slice(2));
  const cmd = positional[0];
  if (!cmd || flags.help) {
    console.log(
      [
        "Usage: node .agents/skills/release-vscode/scripts/release.mjs <command> [options]",
        "",
        "Commands:",
        "  status [--target <ref>] [--find-green] [--no-fetch] [--json]",
        "  notes --from <tag> [--to <ref>] [--version <X.Y.Z>]",
        "  deploy-livekit [--wait] [--dry-run]",
        "  cut <prerelease|promote|rollback> [--target <ref>] [--version <X.Y.Z>] [--dry-run]",
      ].join("\n"),
    );
    return;
  }

  if (cmd === "status") return cmdStatus(flags);
  if (cmd === "notes") return cmdNotes(flags);
  if (cmd === "deploy-livekit") return cmdDeployLivekit(flags);
  if (cmd === "cut") return cmdCut(positional[1], flags);

  throw new Error(`Unknown command '${cmd}'. Run with --help for usage.`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
