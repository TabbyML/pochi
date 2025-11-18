import * as assert from "node:assert";
import * as sinon from "sinon";
import { describe, it, beforeEach, afterEach } from "mocha";
import type { GitWorktree } from "@getpochi/common/vscode-webui-bridge";
import { WorktreeManager } from "../worktree";

describe("WorktreeManager", () => {
  describe("getWorktreeDisplayName", () => {
    let worktreeManager: WorktreeManager;
    let gitStateMonitorStub: any;

    beforeEach(() => {
      // Create a stub for GitStateMonitor
      gitStateMonitorStub = {
        onDidRepositoryChange: sinon.stub().returns({ dispose: () => {} }),
        onDidChangeGitState: sinon.stub().returns({ dispose: () => {} }),
      };

      // Create worktreeManager instance with stubbed dependencies
      worktreeManager = new WorktreeManager(gitStateMonitorStub);
    });

    afterEach(() => {
      worktreeManager.dispose();
      sinon.restore();
    });

    it("should return 'main' for main worktree", () => {
      const mainWorktree: GitWorktree = {
        path: "/path/to/repo",
        commit: "abc123",
        branch: "master",
        isMain: true,
      };

      worktreeManager.worktrees.value = [mainWorktree];

      const result = worktreeManager.getWorktreeDisplayName("/path/to/repo");
      assert.strictEqual(result, "main");
    });

    it("should return worktree name from path for non-main worktree", () => {
      const featureWorktree: GitWorktree = {
        path: "/path/to/worktrees/feature-branch",
        commit: "def456",
        branch: "feature-branch",
        isMain: false,
      };

      worktreeManager.worktrees.value = [featureWorktree];

      const result = worktreeManager.getWorktreeDisplayName(
        "/path/to/worktrees/feature-branch",
      );
      assert.strictEqual(result, "feature-branch");
    });

    it("should extract name from path for unknown worktree", () => {
      worktreeManager.worktrees.value = [];

      const result = worktreeManager.getWorktreeDisplayName(
        "/path/to/worktrees/unknown-worktree",
      );
      assert.strictEqual(result, "unknown-worktree");
    });

    it("should handle main worktree even if branch name is not 'main'", () => {
      const mainWorktree: GitWorktree = {
        path: "/path/to/repo",
        commit: "abc123",
        branch: "develop",
        isMain: true,
      };

      worktreeManager.worktrees.value = [mainWorktree];

      const result = worktreeManager.getWorktreeDisplayName("/path/to/repo");
      assert.strictEqual(result, "main");
    });

    it("should handle multiple worktrees correctly", () => {
      const mainWorktree: GitWorktree = {
        path: "/path/to/repo",
        commit: "abc123",
        branch: "master",
        isMain: true,
      };

      const featureWorktree1: GitWorktree = {
        path: "/path/to/worktrees/feature-1",
        commit: "def456",
        branch: "feature-1",
        isMain: false,
      };

      const featureWorktree2: GitWorktree = {
        path: "/path/to/worktrees/feature-2",
        commit: "ghi789",
        branch: "feature-2",
        isMain: false,
      };

      worktreeManager.worktrees.value = [
        mainWorktree,
        featureWorktree1,
        featureWorktree2,
      ];

      assert.strictEqual(
        worktreeManager.getWorktreeDisplayName("/path/to/repo"),
        "main",
      );
      assert.strictEqual(
        worktreeManager.getWorktreeDisplayName("/path/to/worktrees/feature-1"),
        "feature-1",
      );
      assert.strictEqual(
        worktreeManager.getWorktreeDisplayName("/path/to/worktrees/feature-2"),
        "feature-2",
      );
    });
  });

  describe("parseWorktreePorcelain", () => {
    let worktreeManager: WorktreeManager;
    let gitStateMonitorStub: any;

    beforeEach(() => {
      gitStateMonitorStub = {
        onDidRepositoryChange: sinon.stub().returns({ dispose: () => {} }),
        onDidChangeGitState: sinon.stub().returns({ dispose: () => {} }),
      };

      worktreeManager = new WorktreeManager(gitStateMonitorStub);
    });

    afterEach(() => {
      worktreeManager.dispose();
      sinon.restore();
    });

    it("should parse main worktree correctly", () => {
      const output = `worktree /path/to/repo
HEAD abc123
branch refs/heads/main

`;

      // @ts-ignore - accessing private method for testing
      const result = worktreeManager.parseWorktreePorcelain(output);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].path, "/path/to/repo");
      assert.strictEqual(result[0].commit, "abc123");
      assert.strictEqual(result[0].branch, "main");
      assert.strictEqual(result[0].isMain, true);
    });

    it("should parse multiple worktrees", () => {
      const output = `worktree /path/to/repo
HEAD abc123
branch refs/heads/main

worktree /path/to/worktrees/feature-1
HEAD def456
branch refs/heads/feature-1

worktree /path/to/worktrees/feature-2
HEAD ghi789
branch refs/heads/feature-2

`;

      // @ts-ignore - accessing private method for testing
      const result = worktreeManager.parseWorktreePorcelain(output);

      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].isMain, true);
      assert.strictEqual(result[1].isMain, false);
      assert.strictEqual(result[2].isMain, false);
    });

    it("should handle detached HEAD state", () => {
      const output = `worktree /path/to/worktrees/detached
HEAD abc123
detached

`;

      // @ts-ignore - accessing private method for testing
      const result = worktreeManager.parseWorktreePorcelain(output);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].path, "/path/to/worktrees/detached");
      assert.strictEqual(result[0].commit, "abc123");
      assert.strictEqual(result[0].branch, undefined);
    });

    it("should mark first worktree as main if none marked", () => {
      const output = `worktree /path/to/repo
HEAD abc123
branch refs/heads/master

`;

      // @ts-ignore - accessing private method for testing
      const result = worktreeManager.parseWorktreePorcelain(output);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].isMain, true);
    });
  });
});
