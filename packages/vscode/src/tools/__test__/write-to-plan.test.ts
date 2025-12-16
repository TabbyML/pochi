import * as assert from "assert";
import * as os from "node:os";
import * as _path from "node:path";
import { after, before, beforeEach, describe, it } from "mocha";
import * as vscode from "vscode";
import proxyquire from "proxyquire";
import { writeToPlan } from "../write-to-plan";

async function createDirectory(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

describe("writeToPlan Tool", () => {
  let testSuiteRootTempDir: vscode.Uri;
  let currentTestTempDirUri: vscode.Uri;
  let writeToPlanWithMock: typeof writeToPlan;

  before(async () => {
    const rootPath = _path.join(
      os.tmpdir(),
      `vscode-ragdoll-writetoplan-suite-${Date.now()}`,
    );
    testSuiteRootTempDir = vscode.Uri.file(rootPath);
    await createDirectory(testSuiteRootTempDir).catch(() => {
      /* Ignore if already exists */
    });

    const fsMock = {
      getWorkspaceFolder: () => ({
        uri: testSuiteRootTempDir,
        name: "test-workspace",
        index: 0,
      }),
    };

    const module = proxyquire("../write-to-plan", {
      "@/lib/fs": fsMock,
    });
    writeToPlanWithMock = module.writeToPlan;
  });

  after(async () => {
    if (testSuiteRootTempDir) {
      try {
        await vscode.workspace.fs.delete(testSuiteRootTempDir, {
          recursive: true,
          useTrash: false,
        });
      } catch (error) {
        console.error(
          `Error cleaning up test suite root directory ${testSuiteRootTempDir.fsPath}:`,
          error,
        );
      }
    }
  });

  beforeEach(async () => {
    const testDirName = `test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    currentTestTempDirUri = vscode.Uri.joinPath(
      testSuiteRootTempDir,
      testDirName,
    );
    await createDirectory(currentTestTempDirUri);
  });

  it("should write content to the plan file", async () => {
    const taskId = "task-123";
    const content = "# Implementation Plan\n\n- Step 1\n- Step 2";
    const planPath = `.pochi/plans/${taskId}.md`;
    const planUri = vscode.Uri.joinPath(testSuiteRootTempDir, planPath);

    const result = await writeToPlanWithMock(
      { content },
      {
        toolCallId: "test-call-id-123",
        messages: [],
        cwd: testSuiteRootTempDir.fsPath,
        taskId,
      },
    );

    assert.strictEqual(result.success, true);
    const fileContent = await vscode.workspace.fs.readFile(planUri);
    assert.strictEqual(fileContent.toString(), content);
  });

  it("should overwrite existing plan file", async () => {
    const taskId = "task-456";
    const originalContent = "Original Plan";
    const newContent = "Updated Plan";
    const planPath = `.pochi/plans/${taskId}.md`;
    const planUri = vscode.Uri.joinPath(testSuiteRootTempDir, planPath);

    // Create initial plan file
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(testSuiteRootTempDir, ".pochi/plans"));
    await vscode.workspace.fs.writeFile(planUri, Buffer.from(originalContent));

    const result = await writeToPlanWithMock(
      { content: newContent },
      {
        toolCallId: "test-call-id-123",
        messages: [],
        cwd: testSuiteRootTempDir.fsPath,
        taskId,
      },
    );

    assert.strictEqual(result.success, true);
    const fileContent = await vscode.workspace.fs.readFile(planUri);
    assert.strictEqual(fileContent.toString(), newContent);
  });
});
