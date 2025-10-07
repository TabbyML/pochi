import * as assert from "assert";
import * as os from "node:os";
import * as _path from "node:path";
import { after, before, beforeEach, describe, it } from "mocha";
import * as vscode from "vscode";
import proxyquire from "proxyquire";
import { multiApplyDiff } from "../multi-apply-diff";

async function createFile(uri: vscode.Uri, content = ""): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
}

async function createDirectory(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

describe("multiApplyDiff Tool", () => {
  let testSuiteRootTempDir: vscode.Uri;
  let currentTestTempDirUri: vscode.Uri;
  let currentTestTempDirRelativePath: string;
  let multiApplyDiffWithMock: typeof multiApplyDiff;

  before(async () => {
    const rootPath = _path.join(
      os.tmpdir(),
      `vscode-ragdoll-multiapplydiff-suite-${Date.now()}`,
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

    multiApplyDiffWithMock = proxyquire("../multi-apply-diff", {
      "@/lib/fs": fsMock,
    }).multiApplyDiff;
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
    currentTestTempDirRelativePath = testDirName;
    currentTestTempDirUri = vscode.Uri.joinPath(
      testSuiteRootTempDir,
      testDirName,
    );
    await createDirectory(currentTestTempDirUri);
  });

  it("should handle absolute paths", async () => {
    const fileContent = "Line 1\nLine 2\nLine 3\nLine 4";
    const absoluteFilePath = _path.join(
      currentTestTempDirUri.fsPath,
      "absolute-test.txt",
    );
    const fileUri = vscode.Uri.file(absoluteFilePath);
    await createFile(fileUri, fileContent);

    await multiApplyDiffWithMock(
      {
        path: absoluteFilePath,
        edits: [
          {
            searchContent: "Line 2",
            replaceContent: "Modified Line 2",
          },
          {
            searchContent: "Line 3",
            replaceContent: "Modified Line 3",
          },
        ],
      },
      {
        toolCallId: "test-call-id-123",
        messages: [],
        cwd: testSuiteRootTempDir.fsPath,
        nonInteractive: true,
      },
    );

    const updatedContent = await vscode.workspace.fs.readFile(fileUri);
    assert.strictEqual(
      updatedContent.toString(),
      "Line 1\nModified Line 2\nModified Line 3\nLine 4",
    );
  });

  it("should handle relative paths", async () => {
    const fileContent = "Line 1\nLine 2\nLine 3\nLine 4";
    const filePath = _path.join(
      currentTestTempDirRelativePath,
      "relative-test.txt",
    );
    const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
    await createFile(fileUri, fileContent);

    await multiApplyDiffWithMock(
      {
        path: filePath,
        edits: [
          {
            searchContent: "Line 2",
            replaceContent: "Modified Line 2",
          },
          {
            searchContent: "Line 3",
            replaceContent: "Modified Line 3",
          },
        ],
      },
      {
        toolCallId: "test-call-id-123",
        messages: [],
        cwd: testSuiteRootTempDir.fsPath,
        nonInteractive: true,
      },
    );

    const updatedContent = await vscode.workspace.fs.readFile(fileUri);
    assert.strictEqual(
      updatedContent.toString(),
      "Line 1\nModified Line 2\nModified Line 3\nLine 4",
    );
  });
});

