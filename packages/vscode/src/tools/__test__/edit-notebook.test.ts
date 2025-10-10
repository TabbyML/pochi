import * as assert from "assert";
import * as os from "node:os";
import * as _path from "node:path";
import { after, before, beforeEach, describe, it } from "mocha";
import * as vscode from "vscode";
import { editNotebook } from "../edit-notebook";

async function createFile(uri: vscode.Uri, content = ""): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
}

async function createDirectory(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

describe("editNotebook Tool", () => {
  let testSuiteRootTempDir: vscode.Uri;
  let currentTestTempDirUri: vscode.Uri;
  let currentTestTempDirRelativePath: string;

  before(async () => {
    const rootPath = _path.join(
      os.tmpdir(),
      `vscode-ragdoll-editnotebook-suite-${Date.now()}`,
    );
    testSuiteRootTempDir = vscode.Uri.file(rootPath);
    await createDirectory(testSuiteRootTempDir).catch(() => {
      /* Ignore if already exists */
    });
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
    const notebookContent = JSON.stringify(
      {
        cells: [
          { id: "cell-1", source: "print('hello')" },
          { id: "cell-2", source: "print('world')" },
        ],
      },
      null,
      2,
    );
    const absoluteFilePath = _path.join(
      currentTestTempDirUri.fsPath,
      "absolute-test.ipynb",
    );
    const fileUri = vscode.Uri.file(absoluteFilePath);
    await createFile(fileUri, notebookContent);

    const result = await editNotebook(
      {
        path: absoluteFilePath,
        cellId: "cell-2",
        content: "print('updated world')",
      },
      {
        toolCallId: "test-call-id-123",
        messages: [],
        cwd: testSuiteRootTempDir.fsPath,
      },
    );

    assert.strictEqual(result.success, true);

    const updatedContent = await vscode.workspace.fs.readFile(fileUri);
    const notebook = JSON.parse(updatedContent.toString());
    assert.strictEqual(notebook.cells[1].source, "print('updated world')");
  });

  it("should handle relative paths", async () => {
    const notebookContent = JSON.stringify(
      {
        cells: [
          { id: "cell-1", source: "print('hello')" },
          { id: "cell-2", source: "print('world')" },
        ],
      },
      null,
      2,
    );
    const filePath = _path.join(
      currentTestTempDirRelativePath,
      "relative-test.ipynb",
    );
    const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
    await createFile(fileUri, notebookContent);

    const result = await editNotebook(
      {
        path: filePath,
        cellId: "cell-2",
        content: "print('updated world')",
      },
      {
        toolCallId: "test-call-id-123",
        messages: [],
        cwd: testSuiteRootTempDir.fsPath,
      },
    );

    assert.strictEqual(result.success, true);

    const updatedContent = await vscode.workspace.fs.readFile(fileUri);
    const notebook = JSON.parse(updatedContent.toString());
    assert.strictEqual(notebook.cells[1].source, "print('updated world')");
  });
});

