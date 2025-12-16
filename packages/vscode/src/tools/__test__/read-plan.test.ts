import * as assert from "assert";
import * as os from "node:os";
import * as _path from "node:path";
import { after, before, beforeEach, describe, it } from "mocha";
import * as vscode from "vscode";
import proxyquire from "proxyquire";
import { readPlan } from "../read-plan";

async function createDirectory(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

describe("readPlan Tool", () => {
  let testSuiteRootTempDir: vscode.Uri;
  let currentTestTempDirUri: vscode.Uri;
  let readPlanWithMock: typeof readPlan;

  before(async () => {
    const rootPath = _path.join(
      os.tmpdir(),
      `vscode-ragdoll-readplan-suite-${Date.now()}`,
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
      readFileContent: async (filePath: string) => {
        try {
          const fileUri = vscode.Uri.file(filePath);
          const fileContent = await vscode.workspace.fs.readFile(fileUri);
          return Buffer.from(fileContent).toString("utf8");
        } catch (error) {
          return null;
        }
      },
    };

    const module = proxyquire("../read-plan", {
      "@/lib/fs": fsMock,
    });
    readPlanWithMock = module.readPlan;
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

  it("should read content from the plan file", async () => {
    const taskId = "task-123";
    const content = "# Implementation Plan\n\n- Step 1\n- Step 2";
    const planPath = `.pochi/plans/${taskId}.md`;
    const planUri = vscode.Uri.joinPath(testSuiteRootTempDir, planPath);

    // Create plan file
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(testSuiteRootTempDir, ".pochi/plans"));
    await vscode.workspace.fs.writeFile(planUri, Buffer.from(content));

    // Verify file existence
    try {
        const stats = await vscode.workspace.fs.stat(planUri);
        console.log("File exists at:", planUri.fsPath, "Size:", stats.size);
    } catch (e) {
        console.error("File does not exist at:", planUri.fsPath);
    }

    const result = await readPlanWithMock(
      {},
      {
        toolCallId: "test-call-id-123",
        messages: [],
        cwd: testSuiteRootTempDir.fsPath,
        taskId,
      },
    );

    assert.strictEqual(result.content, content);
  });

  it("should return empty string if plan file does not exist", async () => {
    const taskId = "task-non-existent";
    
    const result = await readPlanWithMock(
      {},
      {
        toolCallId: "test-call-id-123",
        messages: [],
        cwd: testSuiteRootTempDir.fsPath,
        taskId,
      },
    );

    assert.strictEqual(result.content, "");
  });
});
