// Pure helpers for Pochi VS Code rolling release management.
// Run unit tests with: node --test .agents/skills/release-vscode/scripts/release.test.mjs

import { parseArgs } from "node:util";

// Strict `major.minor.patch` integers without leading zeros (VS Marketplace
// rejects semver pre-release suffixes, and leading zeros break shell math).
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const DEV_SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-dev$/;
const TAG_PREFIX = "vscode@";

export const REQUIRED_CHECK_NAMES = ["pre-push", "test-integration"];

// `ci.yml` (`pre-push`) only runs on `main` and PRs to `main`, while
// `test-integration.yml` also runs on `release-*` branches. Hotfix branches and
// rollback targets (re-tags of already released commits) therefore can only be
// gated on `test-integration`.
export const HOTFIX_REQUIRED_CHECK_NAMES = ["test-integration"];

export const CUT_MODES = ["prerelease", "promote", "rollback", "hotfix"];

export function requiredChecksForMode(mode) {
  return mode === "hotfix" || mode === "rollback"
    ? HOTFIX_REQUIRED_CHECK_NAMES
    : REQUIRED_CHECK_NAMES;
}

export function requiredChecksForRef(ref) {
  return typeof ref === "string" && /^(?:origin\/)?release-/.test(ref)
    ? HOTFIX_REQUIRED_CHECK_NAMES
    : REQUIRED_CHECK_NAMES;
}

const CLI_OPTIONS = {
  help: { type: "boolean", short: "h" },
  target: { type: "string" },
  version: { type: "string" },
  ref: { type: "string" },
  from: { type: "string" },
  to: { type: "string" },
  json: { type: "boolean" },
  wait: { type: "boolean" },
  force: { type: "boolean" },
  "find-green": { type: "boolean" },
  "no-fetch": { type: "boolean" },
  "dry-run": { type: "boolean" },
  "no-watch": { type: "boolean" },
  "no-bump-dev": { type: "boolean" },
  "skip-livekit-check": { type: "boolean" },
  "allow-unverified-ci": { type: "boolean" },
};

const COMMAND_OPTIONS = {
  status: ["target", "find-green", "no-fetch", "json"],
  notes: ["from", "to", "version"],
  "deploy-livekit": ["ref", "wait", "dry-run"],
  "bump-dev": ["version", "dry-run", "no-fetch"],
  cut: [
    "target",
    "version",
    "dry-run",
    "no-watch",
    "no-bump-dev",
    "no-fetch",
    "skip-livekit-check",
    "allow-unverified-ci",
    "force",
  ],
};

const COMMAND_MAX_ARGS = {
  status: 0,
  notes: 0,
  "deploy-livekit": 0,
  "bump-dev": 0,
  cut: 1,
};

/**
 * Strictly parse CLI arguments. Unknown options, options not supported by the
 * command, missing option values, and extra positionals all throw, so a typo
 * such as `--dryrun` can never fall through to a real tag push.
 */
export function parseCliArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: CLI_OPTIONS,
    allowPositionals: true,
    strict: true,
  });
  const [command = null, ...args] = positionals;
  if (values.help || !command) {
    return { command, args, flags: values, help: true };
  }
  const allowed = COMMAND_OPTIONS[command];
  if (!allowed) {
    throw new Error(`Unknown command '${command}'. Run with --help for usage.`);
  }
  for (const key of Object.keys(values)) {
    if (!allowed.includes(key)) {
      throw new Error(`Option '--${key}' is not supported by '${command}'.`);
    }
  }
  if (args.length > COMMAND_MAX_ARGS[command]) {
    throw new Error(
      `Unexpected argument(s) for '${command}': ${args.join(" ")}`,
    );
  }
  return { command, args, flags: values, help: false };
}

export const LIVEKIT_WATCHED_PREFIXES = [
  "packages/livekit/",
  "packages/livekit-cf/",
  "packages/vscode-webui/",
];

/**
 * Parse a `vscode@X.Y.Z` tag (or bare `X.Y.Z` string) into numeric components.
 * VS Marketplace & Open VSX require strict `major.minor.patch` integers.
 */
export function parseVscodeVersion(input) {
  if (typeof input !== "string") return null;
  const raw = input.startsWith(TAG_PREFIX)
    ? input.slice(TAG_PREFIX.length)
    : input;
  const match = SEMVER_RE.exec(raw.trim());
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const version = `${major}.${minor}.${patch}`;
  return {
    tag: `${TAG_PREFIX}${version}`,
    version,
    major,
    minor,
    patch,
    channel: minor % 2 === 0 ? "stable" : "prerelease",
  };
}

export function compareVersions(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Given all `{ tag, commitSha }` records, compute current release state and
 * next target versions for `prerelease`, `promote`, `rollback`, and `hotfix`
 * (both of the latter publish the next Stable patch).
 */
export function computeReleaseState(tagRecords) {
  const parsed = [];
  for (const record of tagRecords) {
    const info = parseVscodeVersion(record.tag);
    if (!info) continue;
    parsed.push({ ...info, commitSha: record.commitSha });
  }
  parsed.sort((a, b) => compareVersions(b, a));

  const latestTag = parsed[0] ?? null;
  const stableTags = parsed.filter((t) => t.channel === "stable");
  const latestStable = stableTags[0] ?? null;

  // If `latestStable` is already a rollback/re-tag of an earlier stable tag
  // (sharing its commitSha), skip over the rolled-back tags in between so the
  // next default rollback never bounces back to the broken release.
  let previousStable = null;
  if (latestStable) {
    let anchorIdx = 0;
    if (latestStable.commitSha) {
      for (let i = 1; i < stableTags.length; i++) {
        if (stableTags[i].commitSha === latestStable.commitSha) {
          anchorIdx = i;
        }
      }
    }
    previousStable =
      stableTags
        .slice(anchorIdx + 1)
        .find((t) => t.commitSha !== latestStable.commitSha) ?? null;
  }

  const prereleaseCandidates = parsed.filter(
    (t) =>
      t.channel === "prerelease" &&
      (!latestStable || compareVersions(t, latestStable) > 0),
  );
  const activePrerelease = prereleaseCandidates[0] ?? null;

  let nextPrerelease = "0.1.0";
  if (activePrerelease) {
    nextPrerelease = `${activePrerelease.major}.${activePrerelease.minor}.${activePrerelease.patch + 1}`;
  } else if (latestStable) {
    nextPrerelease = `${latestStable.major}.${latestStable.minor + 1}.0`;
  }

  let nextPromote = "0.2.0";
  if (activePrerelease) {
    nextPromote = `${activePrerelease.major}.${activePrerelease.minor + 1}.0`;
  } else if (latestStable) {
    nextPromote = `${latestStable.major}.${latestStable.minor + 2}.0`;
  }

  const nextRollback = latestStable
    ? `${latestStable.major}.${latestStable.minor}.${latestStable.patch + 1}`
    : null;

  let nextDevVersion = "0.1.0-dev";
  if (activePrerelease) {
    nextDevVersion = `${activePrerelease.major}.${activePrerelease.minor}.0-dev`;
  } else if (latestStable) {
    nextDevVersion = `${latestStable.major}.${latestStable.minor + 1}.0-dev`;
  }

  return {
    latestTag,
    latestStable,
    previousStable,
    activePrerelease,
    nextDevVersion,
    nextVersions: {
      prerelease: nextPrerelease,
      promote: nextPromote,
      rollback: nextRollback,
      hotfix: nextRollback,
    },
  };
}

export function parseDevVersion(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  const devMatch = DEV_SEMVER_RE.exec(trimmed);
  if (devMatch) {
    const major = Number(devMatch[1]);
    const minor = Number(devMatch[2]);
    const patch = Number(devMatch[3]);
    return {
      version: `${major}.${minor}.${patch}-dev`,
      major,
      minor,
      patch,
      isDev: true,
    };
  }
  const rel = parseVscodeVersion(trimmed);
  if (!rel) return null;
  return {
    version: rel.version,
    major: rel.major,
    minor: rel.minor,
    patch: rel.patch,
    isDev: false,
  };
}

export function evaluateDevVersionSync(currentPkgVersion, expectedDevVersion) {
  const expected = parseDevVersion(expectedDevVersion);
  if (!expected || !expected.isDev) {
    throw new Error(
      `Invalid expected dev version '${expectedDevVersion}'. Expected major.minor.patch-dev.`,
    );
  }
  const current = parseDevVersion(currentPkgVersion);
  if (!current) {
    return {
      needsBump: true,
      currentVersion: currentPkgVersion ?? null,
      expectedVersion: expected.version,
    };
  }
  const cmp = compareVersions(current, expected);
  return {
    needsBump: cmp < 0,
    currentVersion: current.version,
    expectedVersion: expected.version,
  };
}

/**
 * Update `"version"` in `packages/vscode/package.json` (and `bun.lock` if
 * provided) without reformatting surrounding JSON arrays/indentation so Biome
 * checks pass unchanged.
 */
export function replaceVscodeDevVersion({
  pkgJsonText,
  bunLockText = null,
  nextDevVersion,
}) {
  const parsedNext = parseDevVersion(nextDevVersion);
  if (!parsedNext || !parsedNext.isDev) {
    throw new Error(
      `Invalid dev version '${nextDevVersion}'. Expected strict major.minor.patch-dev.`,
    );
  }
  const versionLineRe = /^(\s*"version":\s*)"[^"]*"(,?)$/m;
  if (!versionLineRe.test(pkgJsonText)) {
    throw new Error(
      'Could not locate top-level "version" field in packages/vscode/package.json',
    );
  }
  const updatedPkgJson = pkgJsonText.replace(
    versionLineRe,
    `$1"${parsedNext.version}"$2`,
  );
  const parsedJson = JSON.parse(updatedPkgJson);
  if (parsedJson.version !== parsedNext.version) {
    throw new Error(
      `Failed to update packages/vscode/package.json version to ${parsedNext.version}`,
    );
  }

  let updatedBunLock = bunLockText;
  if (typeof bunLockText === "string") {
    const lockRe =
      /("packages\/vscode":\s*\{\s*\n\s*"name":\s*"pochi",\s*\n\s*"version":\s*)"[^"]*"/;
    if (lockRe.test(bunLockText)) {
      updatedBunLock = bunLockText.replace(lockRe, `$1"${parsedNext.version}"`);
    }
  }

  return {
    pkgJsonText: updatedPkgJson,
    bunLockText: updatedBunLock,
  };
}

const NOISE_COMMIT_RE =
  /^chore(?:\([^)]+\))?:\s*(?:release\b|bump version to\b)/i;
const CONVENTIONAL_RE = /^([a-z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/;

export function categorizeCommit(subject) {
  const trimmed = subject.trim();
  if (NOISE_COMMIT_RE.test(trimmed)) {
    return { category: "ignore", breaking: false, text: trimmed };
  }
  const match = CONVENTIONAL_RE.exec(trimmed);
  if (!match) {
    return { category: "other", breaking: false, text: trimmed };
  }
  const [, type, scope, bang, desc] = match;
  const breaking = Boolean(bang);
  const formatted = scope ? `**${scope}**: ${desc}` : desc;
  if (type === "feat") {
    return { category: "features", breaking, text: formatted };
  }
  if (type === "fix") {
    return { category: "fixes", breaking, text: formatted };
  }
  if (type === "perf" || type === "refactor") {
    return { category: "improvements", breaking, text: formatted };
  }
  return { category: "other", breaking, text: formatted };
}

/**
 * Render categorized Markdown release notes from `{ sha, subject }[]` commits.
 */
export function generateReleaseNotes({
  commits,
  fromTag,
  toTag,
  repo = "TabbyML/pochi",
  rollbackFromTag = null,
}) {
  const lines = [];
  if (rollbackFromTag) {
    lines.push(
      `> **Rollback release**: restores the build from \`${rollbackFromTag}\`.`,
      "",
    );
  }

  const buckets = {
    features: [],
    fixes: [],
    improvements: [],
    other: [],
  };

  for (const commit of commits) {
    const item = categorizeCommit(commit.subject);
    if (item.category === "ignore") continue;
    const prefix = item.breaking ? "**BREAKING** " : "";
    const shortSha = commit.sha ? ` (${commit.sha.slice(0, 7)})` : "";
    buckets[item.category].push(`- ${prefix}${item.text}${shortSha}`);
  }

  const sections = [
    ["Features", buckets.features],
    ["Bug Fixes", buckets.fixes],
    ["Improvements", buckets.improvements],
    ["Other Changes", buckets.other],
  ];

  for (const [heading, entries] of sections) {
    if (entries.length === 0) continue;
    lines.push(`## ${heading}`, "", ...entries, "");
  }

  if (lines.length === 0) {
    lines.push("Maintenance release.", "");
  }

  if (rollbackFromTag) {
    if (fromTag && rollbackFromTag !== fromTag) {
      lines.push(
        `**Rolled back changes**: https://github.com/${repo}/compare/${rollbackFromTag}...${fromTag}`,
      );
    }
  } else if (fromTag && toTag) {
    lines.push(
      `**Full Changelog**: https://github.com/${repo}/compare/${fromTag}...${toTag}`,
    );
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * Evaluate GitHub check-runs for a target commit SHA.
 * When multiple runs share the same name (e.g. PR + push `pre-push`), prefer
 * completed successful runs, otherwise report the latest status.
 */
export function evaluateCiGates(
  checkRuns,
  requiredNames = REQUIRED_CHECK_NAMES,
) {
  const byName = new Map();
  for (const run of checkRuns) {
    const existing = byName.get(run.name) ?? [];
    existing.push(run);
    byName.set(run.name, existing);
  }

  const results = [];
  let ok = true;

  for (const name of requiredNames) {
    const runs = byName.get(name) ?? [];
    if (runs.length === 0) {
      ok = false;
      results.push({
        name,
        passed: false,
        state: "missing",
        details: "no run",
      });
      continue;
    }
    const succeeded = runs.find(
      (r) => r.status === "completed" && r.conclusion === "success",
    );
    if (succeeded) {
      results.push({
        name,
        passed: true,
        state: "success",
        details: succeeded.html_url ?? "",
      });
      continue;
    }
    const inProgress = runs.find((r) => r.status !== "completed");
    if (inProgress) {
      ok = false;
      results.push({
        name,
        passed: false,
        state: "pending",
        details: inProgress.status,
      });
      continue;
    }
    const latest = runs[runs.length - 1];
    ok = false;
    results.push({
      name,
      passed: false,
      state: latest.conclusion ?? "failed",
      details: latest.html_url ?? "",
    });
  }

  return { ok, results };
}

/**
 * Check whether changed file paths require a `deploy-livekit-cf.yml` deployment.
 */
export function detectLivekitDrift(changedFiles) {
  const matched = changedFiles.filter((file) =>
    LIVEKIT_WATCHED_PREFIXES.some((prefix) => file.startsWith(prefix)),
  );
  const packages = Array.from(
    new Set(matched.map((file) => file.split("/").slice(0, 2).join("/"))),
  ).sort();
  return {
    needsDeploy: matched.length > 0,
    packages,
    fileCount: matched.length,
    sampleFiles: matched.slice(0, 10),
  };
}

/**
 * Scan changed files between latest Stable and target SHA for rollback or
 * backend compatibility hazards (since VS Marketplace has no % rollout).
 */
export function scanCompatibilityRisks(changedFiles) {
  const warnings = [];

  const livestoreSchemaFiles = changedFiles.filter(
    (f) =>
      f === "packages/livekit/src/livestore/default-schema.ts" ||
      (f.startsWith("packages/livekit/src/livestore/") && f.endsWith(".ts")),
  );
  if (livestoreSchemaFiles.length > 0) {
    warnings.push({
      kind: "livestore-schema",
      severity: "high",
      files: livestoreSchemaFiles,
      message:
        "LiveStore schema/materializer files changed. Verify additive-only evolution so rolling back to the previous Stable extension will not fail to open local SQLite state.",
    });
  }

  const configSchemaFiles = changedFiles.filter((f) =>
    f.startsWith("packages/common/src/configuration/"),
  );
  if (configSchemaFiles.length > 0) {
    warnings.push({
      kind: "config-schema",
      severity: "medium",
      files: configSchemaFiles,
      message:
        "Configuration schema changed. Confirm existing .pochi/config.jsonc files remain forward/backward compatible across rollback.",
    });
  }

  const backendContractFiles = changedFiles.filter(
    (f) =>
      f.startsWith("packages/vendor-pochi/") ||
      f.startsWith("private/packages/server/"),
  );
  if (backendContractFiles.length > 0) {
    warnings.push({
      kind: "backend-contract",
      severity: "high",
      files: backendContractFiles,
      message:
        "Pochi vendor/server protocol files changed. Confirm any required ragdoll server changes are already deployed before publishing the extension.",
    });
  }

  if (changedFiles.includes("packages/vscode/package.json")) {
    warnings.push({
      kind: "vscode-manifest",
      severity: "low",
      files: ["packages/vscode/package.json"],
      message:
        "packages/vscode/package.json changed. Check whether engines.vscode or contributed command/view IDs changed.",
    });
  }

  return warnings;
}

/**
 * Verify that `.github/workflows/release-pochi-vscode-extension.yml` at a
 * rollback commit injects the git tag version into `packages/vscode/package.json`.
 * Commits prior to rolling-release adoption hardcoded `package.json` version,
 * so re-tagging them with a new patch tag would publish the old version number.
 */
export function workflowSupportsTagVersion(workflowYaml) {
  if (typeof workflowYaml !== "string") return false;
  return (
    workflowYaml.includes("packages/vscode/package.json") &&
    workflowYaml.includes("pkg.version")
  );
}
