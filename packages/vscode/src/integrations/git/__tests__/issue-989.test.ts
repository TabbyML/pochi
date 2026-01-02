import * as assert from "node:assert";
import * as sinon from "sinon";
import { describe, it, beforeEach, afterEach } from "mocha";
import proxyquire from "proxyquire";
import * as vscode from "vscode";

const generateBranchNameStub = sinon.stub();
const simpleGitStub = sinon.stub().returns({
  revparse: sinon.stub().resolves("gitdir"),
  checkIsRepo: sinon.stub().resolves(true),
  raw: sinon.stub().resolves(""),
});

const { WorktreeManager } = proxyquire.noCallThru()("../worktree", {
  "@/lib/generate-branch-name": { generateBranchName: generateBranchNameStub },
  "simple-git": simpleGitStub,
});

describe("WorktreeManager Repro #989", () => {
    let worktreeManager: any;
    let gitStateStub: any;

    beforeEach(() => {
      gitStateStub = {
        onDidRepositoryChange: sinon.stub().returns({ dispose: () => {} }),
        onDidChangeGitState: sinon.stub().returns({ dispose: () => {} }),
      };

      const worktreeDataStoreStub = {
        initialize: sinon.stub(),
        get: sinon.stub().returns(undefined),
        delete: sinon.stub(),
      } as any;

      const pochiConfigurationStub = {
        detectWorktreesLimit: { value: 10 },
      };

      // Mock vscode.workspace.workspaceFolders
      // Using sinon to stub the property getter
      sinon.stub(vscode.workspace, "workspaceFolders").value([{ uri: { fsPath: "/path/to/repo" } }]);

      worktreeManager = new WorktreeManager(
        gitStateStub,
        worktreeDataStoreStub,
        pochiConfigurationStub,
      );
    });

    afterEach(() => {
      if (worktreeManager) worktreeManager.dispose();
      sinon.restore();
    });

    it("should return 'workspace' when cwd matches workspace path even if worktree is not found", () => {
      worktreeManager.worktrees.value = [];
      const result = worktreeManager.getWorktreeDisplayName("/path/to/repo");
      assert.strictEqual(result, "workspace");
    });
});