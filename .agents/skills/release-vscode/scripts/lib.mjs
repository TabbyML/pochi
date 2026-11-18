// Pure helpers for Pochi VS Code rolling release management.
// Run unit tests with: node --test .agents/skills/release-vscode/scripts/release.test.mjs

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const TAG_PREFIX = "vscode@";

export const REQUIRED_CHECK_NAMES = ["pre-push", "test-integration"];

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
 * next target versions for `prerelease`, `promote`, and `rollback`.
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
  const previousStable = stableTags[1] ?? null;

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

  return {
    latestTag,
    latestStable,
    previousStable,
    activePrerelease,
    nextVersions: {
      prerelease: nextPrerelease,
      promote: nextPromote,
      rollback: nextRollback,
    },
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

  if (fromTag && toTag) {
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
