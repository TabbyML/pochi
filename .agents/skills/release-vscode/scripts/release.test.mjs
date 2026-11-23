import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  categorizeCommit,
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

test("parseCliArgs accepts --key=value and flags before positionals", () => {
  const parsed = parseCliArgs([
    "cut",
    "--dry-run",
    "prerelease",
    "--target=abc123",
    "--version",
    "0.85.1",
  ]);
  assert.equal(parsed.help, false);
  assert.equal(parsed.command, "cut");
  assert.deepEqual(parsed.args, ["prerelease"]);
  assert.equal(parsed.flags["dry-run"], true);
  assert.equal(parsed.flags.target, "abc123");
  assert.equal(parsed.flags.version, "0.85.1");

  assert.equal(parseCliArgs([]).help, true);
  assert.equal(parseCliArgs(["cut", "--help"]).help, true);

  const deployParsed = parseCliArgs([
    "deploy-livekit",
    "--ref",
    "release-vscode-0-86",
    "--wait",
  ]);
  assert.equal(deployParsed.flags.ref, "release-vscode-0-86");
  assert.equal(deployParsed.flags.wait, true);

  const bumpParsed = parseCliArgs(["bump-dev", "--dry-run"]);
  assert.equal(bumpParsed.command, "bump-dev");
  assert.equal(bumpParsed.flags["dry-run"], true);
});

test("parseCliArgs rejects typos, unsupported options, and missing values", () => {
  // A typo must never fall through to a real tag push.
  assert.throws(() => parseCliArgs(["cut", "prerelease", "--dryrun"]));
  assert.throws(
    () => parseCliArgs(["status", "--dry-run"]),
    /not supported by 'status'/,
  );
  assert.throws(() => parseCliArgs(["cut", "prerelease", "--target"]));
  assert.throws(() =>
    parseCliArgs(["cut", "prerelease", "--target", "--dry-run"]),
  );
  assert.throws(() => parseCliArgs(["cut", "--dry-run=true", "prerelease"]));
  assert.throws(
    () => parseCliArgs(["cut", "prerelease", "extra"]),
    /Unexpected argument/,
  );
  assert.throws(() => parseCliArgs(["publish"]), /Unknown command/);
});

test("requiredChecksForMode only gates hotfix and rollback on test-integration", () => {
  assert.deepEqual(requiredChecksForMode("prerelease"), [
    "pre-push",
    "test-integration",
  ]);
  assert.deepEqual(requiredChecksForMode("promote"), [
    "pre-push",
    "test-integration",
  ]);
  assert.deepEqual(requiredChecksForMode("hotfix"), ["test-integration"]);
  assert.deepEqual(requiredChecksForMode("rollback"), ["test-integration"]);

  assert.deepEqual(requiredChecksForRef("origin/main"), [
    "pre-push",
    "test-integration",
  ]);
  assert.deepEqual(requiredChecksForRef("origin/release-vscode-0-86"), [
    "test-integration",
  ]);
  assert.deepEqual(requiredChecksForRef("release-vscode-0-86"), [
    "test-integration",
  ]);
});

test("parseVscodeVersion classifies odd minor as prerelease and even minor as stable", () => {
  assert.deepEqual(parseVscodeVersion("vscode@0.84.0"), {
    tag: "vscode@0.84.0",
    version: "0.84.0",
    major: 0,
    minor: 84,
    patch: 0,
    channel: "stable",
  });
  assert.deepEqual(parseVscodeVersion("0.85.2"), {
    tag: "vscode@0.85.2",
    version: "0.85.2",
    major: 0,
    minor: 85,
    patch: 2,
    channel: "prerelease",
  });
  // Marketplace rejects semver prerelease suffixes like -dev / -rc.1
  assert.equal(parseVscodeVersion("0.85.0-dev"), null);
  assert.equal(parseVscodeVersion("invalid"), null);
  // Leading zeros are rejected (the workflow's shell math would read them as octal).
  assert.equal(parseVscodeVersion("0.08.0"), null);
  assert.equal(parseVscodeVersion("vscode@00.84.0"), null);
});

test("computeReleaseState calculates next versions when latest release is even stable", () => {
  const state = computeReleaseState([
    { tag: "vscode@0.82.0", commitSha: "aaaa111" },
    { tag: "vscode@0.83.0", commitSha: "bbbb222" },
    { tag: "vscode@0.83.1", commitSha: "cccc333" },
    { tag: "vscode@0.84.0", commitSha: "dddd444" },
  ]);

  assert.equal(state.latestStable?.tag, "vscode@0.84.0");
  assert.equal(state.previousStable?.tag, "vscode@0.82.0");
  assert.equal(state.activePrerelease, null);
  assert.equal(state.nextDevVersion, "0.85.0-dev");
  assert.deepEqual(state.nextVersions, {
    prerelease: "0.85.0",
    promote: "0.86.0",
    rollback: "0.84.1",
    hotfix: "0.84.1",
  });
});

test("computeReleaseState skips rolled-back broken release when computing previousStable", () => {
  const afterRollback = computeReleaseState([
    { tag: "vscode@0.82.0", commitSha: "zzzz000" },
    { tag: "vscode@0.84.0", commitSha: "aaaa111" },
    { tag: "vscode@0.86.0", commitSha: "bbbb222" }, // broken release
    { tag: "vscode@0.86.1", commitSha: "aaaa111" }, // rollback restoring 0.84.0
  ]);

  assert.equal(afterRollback.latestStable?.tag, "vscode@0.86.1");
  assert.equal(afterRollback.previousStable?.tag, "vscode@0.82.0");
  assert.equal(afterRollback.nextDevVersion, "0.87.0-dev");
});

test("computeReleaseState increments patch during an active odd-minor prerelease cycle", () => {
  const state = computeReleaseState([
    { tag: "vscode@0.84.0", commitSha: "dddd444" },
    { tag: "vscode@0.85.0", commitSha: "eeee555" },
    { tag: "vscode@0.85.1", commitSha: "ffff666" },
  ]);

  assert.equal(state.latestStable?.tag, "vscode@0.84.0");
  assert.equal(state.activePrerelease?.tag, "vscode@0.85.1");
  assert.equal(state.activePrerelease?.commitSha, "ffff666");
  assert.equal(state.nextDevVersion, "0.85.0-dev");
  assert.deepEqual(state.nextVersions, {
    prerelease: "0.85.2",
    promote: "0.86.0",
    rollback: "0.84.1",
    hotfix: "0.84.1",
  });
});

test("categorizeCommit and generateReleaseNotes filter release noise and group conventional commits", () => {
  assert.equal(categorizeCommit("chore: release v0.84.0").category, "ignore");
  assert.equal(
    categorizeCommit("chore(vscode): bump version to 0.83.0-dev (#2087)")
      .category,
    "ignore",
  );

  const notes = generateReleaseNotes({
    fromTag: "vscode@0.84.0",
    toTag: "vscode@0.85.0",
    commits: [
      {
        sha: "1111111aaaa",
        subject: "feat(vscode): add background subagent transcript (#2084)",
      },
      {
        sha: "2222222bbbb",
        subject: "fix(vscode-webui): return to parent task on back (#2062)",
      },
      {
        sha: "3333333cccc",
        subject: "refactor: drop leftover CLI seams (#2088)",
      },
      {
        sha: "4444444dddd",
        subject: "chore(vscode): bump version to 0.83.0-dev (#2087)",
      },
    ],
  });

  assert.match(
    notes,
    /## Features\n\n- \*\*vscode\*\*: add background subagent transcript \(#2084\) \(1111111\)/,
  );
  assert.match(
    notes,
    /## Bug Fixes\n\n- \*\*vscode-webui\*\*: return to parent task on back \(#2062\) \(2222222\)/,
  );
  assert.match(
    notes,
    /## Improvements\n\n- drop leftover CLI seams \(#2088\) \(3333333\)/,
  );
  assert.doesNotMatch(notes, /bump version to/);
  assert.match(
    notes,
    /\*\*Full Changelog\*\*: https:\/\/github\.com\/TabbyML\/pochi\/compare\/vscode@0\.84\.0\.\.\.vscode@0\.85\.0/,
  );

  const rollbackNotes = generateReleaseNotes({
    fromTag: "vscode@0.86.0",
    toTag: "vscode@0.86.1",
    rollbackFromTag: "vscode@0.84.0",
    commits: [],
  });
  assert.match(rollbackNotes, /restores the build from `vscode@0\.84\.0`/);
  assert.match(
    rollbackNotes,
    /\*\*Rolled back changes\*\*: https:\/\/github\.com\/TabbyML\/pochi\/compare\/vscode@0\.84\.0\.\.\.vscode@0\.86\.0/,
  );
});

test("evaluateDevVersionSync and replaceVscodeDevVersion preserve formatting", () => {
  assert.equal(
    evaluateDevVersionSync("0.83.0-dev", "0.85.0-dev").needsBump,
    true,
  );
  assert.equal(
    evaluateDevVersionSync("0.85.0-dev", "0.85.0-dev").needsBump,
    false,
  );
  assert.equal(
    evaluateDevVersionSync("0.87.0-dev", "0.85.0-dev").needsBump,
    false,
  );

  const samplePkg = `{
  "name": "pochi",
  "version": "0.83.0-dev",
  "activationEvents": ["onStartupFinished"]
}\n`;
  const sampleLock = `{
  "packages": {
    "packages/vscode": {
      "name": "pochi",
      "version": "0.83.0-dev",
      "dependencies": {}
    }
  }
}\n`;
  const updated = replaceVscodeDevVersion({
    pkgJsonText: samplePkg,
    bunLockText: sampleLock,
    nextDevVersion: "0.85.0-dev",
  });
  assert.match(updated.pkgJsonText, /"version": "0\.85\.0-dev"/);
  assert.match(
    updated.pkgJsonText,
    /"activationEvents": \["onStartupFinished"\]/,
  );
  assert.match(updated.bunLockText, /"version": "0\.85\.0-dev"/);
});

test("evaluateCiGates requires both pre-push and test-integration to succeed", () => {
  const green = evaluateCiGates([
    { name: "pre-push", status: "completed", conclusion: "cancelled" },
    { name: "pre-push", status: "completed", conclusion: "success" },
    { name: "test-integration", status: "completed", conclusion: "success" },
  ]);
  assert.equal(green.ok, true);

  const pending = evaluateCiGates([
    { name: "pre-push", status: "completed", conclusion: "success" },
    { name: "test-integration", status: "in_progress", conclusion: null },
  ]);
  assert.equal(pending.ok, false);
  assert.equal(pending.results[1].state, "pending");

  const missing = evaluateCiGates([
    { name: "pre-push", status: "completed", conclusion: "success" },
  ]);
  assert.equal(missing.ok, false);
  assert.equal(missing.results[1].state, "missing");
});

test("detectLivekitDrift and scanCompatibilityRisks flag relevant package paths", () => {
  const drift = detectLivekitDrift([
    "packages/vscode/src/extension.ts",
    "packages/vscode-webui/src/features/share/page.tsx",
    "packages/livekit/src/livestore/default-schema.ts",
  ]);
  assert.equal(drift.needsDeploy, true);
  assert.deepEqual(drift.packages, [
    "packages/livekit",
    "packages/vscode-webui",
  ]);

  const risks = scanCompatibilityRisks([
    "packages/livekit/src/livestore/default-schema.ts",
    "packages/vendor-pochi/src/model.ts",
  ]);
  assert.deepEqual(
    risks.map((r) => r.kind),
    ["livestore-schema", "backend-contract"],
  );
});

test("workflowSupportsTagVersion detects the updated repo release workflow", () => {
  const legacyYaml = `
      - name: Build VSIX
        run: |
          cd packages/vscode
          bun run vscode:prepublish
  `;
  assert.equal(workflowSupportsTagVersion(legacyYaml), false);

  const repoWorkflowPath = path.resolve(
    import.meta.dirname,
    "../../../../.github/workflows/release-pochi-vscode-extension.yml",
  );
  const currentYaml = fs.readFileSync(repoWorkflowPath, "utf8");
  assert.equal(workflowSupportsTagVersion(currentYaml), true);
});
