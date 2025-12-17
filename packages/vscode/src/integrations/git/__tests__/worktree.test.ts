import * as assert from "node:assert";
import * as sinon from "sinon";
import { describe, it, beforeEach, afterEach } from "mocha";
import type { GitWorktree } from "@getpochi/common/vscode-webui-bridge";
import proxyquire from "proxyquire";
import path from "node:path";
import type { GitWorktreeInfoProvider } from "../git-worktree-info-provider";

const generateBranchNameStub = sinon.stub();
const { WorktreeManager } = proxyquire("../worktree", {
  "@/lib/generate-branch-name": { generateBranchName: generateBranchNameStub },
});

describe("WorktreeManager", () => {
  describe("getWorktreeDisplayName", () => {
    let worktreeManager: any;
    let gitStateStub: any;

    beforeEach(() => {
      // Create a stub for GitStateMonitor
      gitStateStub = {
        onDidRepositoryChange: sinon.stub().returns({ dispose: () => {} }),
        onDidChangeGitState: sinon.stub().returns({ dispose: () => {} }),
      };

      // Create a stub for GitWorktreeInfoProvider
      const worktreeDataStoreStub: GitWorktreeInfoProvider = {
        initialize: sinon.stub(),
        get: sinon.stub().returns(undefined),
        delete: sinon.stub(),
      } as any;

      // Create worktreeManager instance with stubbed dependencies
      worktreeManager = new WorktreeManager(gitStateStub, worktreeDataStoreStub);
    });

    afterEach(() => {
      worktreeManager.dispose();
      sinon.restore();
    });

    it("should return 'workspace' for main worktree", () => {
      const mainWorktree: GitWorktree = {
        path: "/path/to/repo",
        commit: "abc123",
        branch: "master",
        isMain: true,
      };

      worktreeManager.worktrees.value = [mainWorktree];

      const result = worktreeManager.getWorktreeDisplayName("/path/to/repo");
      assert.strictEqual(result, "workspace");
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
      assert.strictEqual(result, "workspace");
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
        "workspace",
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
    let worktreeManager: any;
    let gitStateStub: any;

    beforeEach(() => {
      gitStateStub = {
        onDidRepositoryChange: sinon.stub().returns({ dispose: () => {} }),
        onDidChangeGitState: sinon.stub().returns({ dispose: () => {} }),
      };

      // Create a stub for GitWorktreeInfoProvider
      const worktreeDataStoreStub: GitWorktreeInfoProvider = {
        initialize: sinon.stub(),
        get: sinon.stub().returns(undefined),
        delete: sinon.stub(),
      } as any;

      worktreeManager = new WorktreeManager(gitStateStub, worktreeDataStoreStub);
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

    it("should parse prunable worktree correctly", () => {
      const output = `worktree /path/to/repo
HEAD abc123
branch refs/heads/main

worktree /path/to/worktrees/old-feature
HEAD def456
branch refs/heads/old-feature
prunable gitdir file points to non-existent location

`;

      // @ts-ignore - accessing private method for testing
      const result = worktreeManager.parseWorktreePorcelain(output);

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].isMain, true);
      assert.strictEqual(result[0].prunable, undefined);
      assert.strictEqual(result[1].isMain, false);
      assert.strictEqual(result[1].path, "/path/to/worktrees/old-feature");
      assert.strictEqual(
        result[1].prunable,
        "gitdir file points to non-existent location",
      );
    });
  });

  describe("prepareBranchNameAndWorktreePath", () => {
    let worktreeManager: any;
    let gitStateStub: any;

    beforeEach(() => {
      gitStateStub = {
        onDidRepositoryChange: sinon.stub().returns({ dispose: () => {} }),
        onDidChangeGitState: sinon.stub().returns({ dispose: () => {} }),
      };

      const worktreeDataStoreStub: GitWorktreeInfoProvider = {
        initialize: sinon.stub(),
        get: sinon.stub().returns(undefined),
        delete: sinon.stub(),
      } as any;

      worktreeManager = new WorktreeManager(gitStateStub, worktreeDataStoreStub);

      worktreeManager.git = {
        branch: sinon.stub().resolves({ all: ["main", "feature-1"] }),
        raw: sinon.stub(),
      };
    });

    afterEach(() => {
      worktreeManager.dispose();
      sinon.restore();
    });

    it("should generate branch name and worktree path correctly", async () => {
      generateBranchNameStub.resolves("new-feature");
      const workspacePath = "/path/to/repo";
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
      const worktrees = [mainWorktree, featureWorktree1];

      const result = await worktreeManager.prepareBranchNameAndWorktreePath({
        workspacePath,
        worktrees,
        prompt: "create new feature",
      });

      assert.deepStrictEqual(result, {
        branchName: "new-feature",
        worktreePath: "/path/to/worktrees/new-feature",
      });
      assert.ok(generateBranchNameStub.calledOnce);
    });

    it("should append timestamp if branch name exists", async () => {
      generateBranchNameStub.resolves("feature-1"); // Exists in gitStub.branch
      const workspacePath = "/path/to/repo";
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
      const worktrees = [mainWorktree, featureWorktree1];

      const result = await worktreeManager.prepareBranchNameAndWorktreePath({
        workspacePath,
        worktrees,
        prompt: "create feature 1",
      });

      assert.ok(result.branchName.startsWith("feature-1-"));
      assert.ok(result.worktreePath.startsWith("/path/to/worktrees/feature-1-"));
    });

    it("should fallback to timestamp if generation returns undefined", async () => {
      generateBranchNameStub.resolves(undefined);
      const workspacePath = "/path/to/repo";
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
      const worktrees = [mainWorktree, featureWorktree1];

      const result = await worktreeManager.prepareBranchNameAndWorktreePath({
        workspacePath,
        worktrees,
        prompt: "create feature",
      });

      assert.ok(result.branchName.startsWith("worktree/"));
      assert.ok(result.worktreePath.startsWith("/path/to/worktrees/worktree-"));
    });

    it("should fallback to timestamp if generation fails", async () => {
      generateBranchNameStub.rejects(new Error("Failed"));
      const workspacePath = "/path/to/repo";
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
      const worktrees = [mainWorktree, featureWorktree1];

      const result = await worktreeManager.prepareBranchNameAndWorktreePath({
        workspacePath,
        worktrees,
        prompt: "create feature",
      });

      assert.ok(result.branchName.startsWith("worktree/"));
      assert.ok(result.worktreePath.startsWith("/path/to/worktrees/worktree-"));
    });

    it("should use workspace folder parent for worktree path if no worktrees", async () => {
      generateBranchNameStub.resolves("new-feature");
      const workspacePath = "/path/to/repo";
      const worktrees: GitWorktree[] = [];

      const result = await worktreeManager.prepareBranchNameAndWorktreePath({
        workspacePath,
        worktrees,
        prompt: "create new feature",
      });
      
      const expectedParent = "/path/to/repo.worktree";
      const expectedPath = path.join(expectedParent, "new-feature");
      
      assert.strictEqual(result.worktreePath, expectedPath);
    });
  });
});