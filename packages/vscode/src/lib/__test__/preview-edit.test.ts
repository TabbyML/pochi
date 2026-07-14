import * as assert from "assert";
import * as os from "node:os";
import * as _path from "node:path";
import { after, before, beforeEach, describe, it } from "mocha";
import * as vscode from "vscode";
import { computePreviewEdit } from "../preview-edit";

async function createFile(uri: vscode.Uri, content = ""): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
}

async function createDirectory(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

describe("computePreviewEdit", () => {
  let testSuiteRootTempDir: vscode.Uri;
  let currentTestTempDirUri: vscode.Uri;

  before(async () => {
    const rootPath = _path.join(
      os.tmpdir(),
      `vscode-pochi-preview-edit-suite-${Date.now()}`,
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
          `Error cleaning up preview-edit test dir ${testSuiteRootTempDir.fsPath}:`,
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

  it("previews an applyDiff without writing to disk", async () => {
    const fileContent = "Line 1\nLine 2\nLine 3\n";
    const fileUri = vscode.Uri.joinPath(currentTestTempDirUri, "apply.txt");
    await createFile(fileUri, fileContent);

    const result = await computePreviewEdit(
      "applyDiff",
      {
        path: fileUri.fsPath,
        searchContent: "Line 2",
        replaceContent: "Modified Line 2",
      },
      testSuiteRootTempDir.fsPath,
    );

    assert.ok(result, "expected a preview result");
    assert.match(result.edit, /-Line 2/);
    assert.match(result.edit, /\+Modified Line 2/);
    assert.strictEqual(result.editSummary.added, 1);
    assert.strictEqual(result.editSummary.removed, 1);

    // The file on disk must remain unchanged.
    const onDisk = await vscode.workspace.fs.readFile(fileUri);
    assert.strictEqual(Buffer.from(onDisk).toString(), fileContent);
  });

  it("previews a multiApplyDiff applied sequentially", async () => {
    const fileContent = "alpha\nbeta\ngamma\n";
    const fileUri = vscode.Uri.joinPath(currentTestTempDirUri, "multi.txt");
    await createFile(fileUri, fileContent);

    const result = await computePreviewEdit(
      "multiApplyDiff",
      {
        path: fileUri.fsPath,
        edits: [
          { searchContent: "alpha", replaceContent: "ALPHA" },
          { searchContent: "gamma", replaceContent: "GAMMA" },
        ],
      },
      testSuiteRootTempDir.fsPath,
    );

    assert.ok(result, "expected a preview result");
    assert.match(result.edit, /\+ALPHA/);
    assert.match(result.edit, /\+GAMMA/);

    const onDisk = await vscode.workspace.fs.readFile(fileUri);
    assert.strictEqual(Buffer.from(onDisk).toString(), fileContent);
  });

  it("previews a writeToFile for a new (non-existent) file", async () => {
    const fileUri = vscode.Uri.joinPath(currentTestTempDirUri, "new-file.txt");

    const result = await computePreviewEdit(
      "writeToFile",
      {
        path: fileUri.fsPath,
        content: "brand new content\n",
      },
      testSuiteRootTempDir.fsPath,
    );

    assert.ok(result, "expected a preview result");
    assert.match(result.edit, /\+brand new content/);

    // The file must not have been created on disk.
    let exists = true;
    try {
      await vscode.workspace.fs.stat(fileUri);
    } catch {
      exists = false;
    }
    assert.strictEqual(exists, false, "preview must not create the file");
  });

  it("returns undefined when there are no changes", async () => {
    const fileContent = "unchanged\n";
    const fileUri = vscode.Uri.joinPath(currentTestTempDirUri, "same.txt");
    await createFile(fileUri, fileContent);

    const result = await computePreviewEdit(
      "writeToFile",
      { path: fileUri.fsPath, content: fileContent },
      testSuiteRootTempDir.fsPath,
    );

    assert.strictEqual(result, undefined);
  });

  it("returns undefined when the search content does not match", async () => {
    const fileUri = vscode.Uri.joinPath(currentTestTempDirUri, "nomatch.txt");
    await createFile(fileUri, "hello world\n");

    const result = await computePreviewEdit(
      "applyDiff",
      {
        path: fileUri.fsPath,
        searchContent: "does not exist",
        replaceContent: "replacement",
      },
      testSuiteRootTempDir.fsPath,
    );

    assert.strictEqual(result, undefined);
  });

  it("returns undefined for non-editing tools", async () => {
    const result = await computePreviewEdit(
      "readFile",
      { path: "whatever.txt" },
      testSuiteRootTempDir.fsPath,
    );

    assert.strictEqual(result, undefined);
  });
});
