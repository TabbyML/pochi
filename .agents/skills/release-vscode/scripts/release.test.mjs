import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  categorizeCommit,
  computeReleaseState,
  detectLivekitDrift,
  evaluateCiGates,
  generateReleaseNotes,
  parseVscodeVersion,
  scanCompatibilityRisks,
  workflowSupportsTagVersion,
} from "./lib.mjs";

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
  assert.deepEqual(state.nextVersions, {
    prerelease: "0.85.0",
    promote: "0.86.0",
    rollback: "0.84.1",
  });
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
  assert.deepEqual(state.nextVersions, {
    prerelease: "0.85.2",
    promote: "0.86.0",
    rollback: "0.84.1",
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
