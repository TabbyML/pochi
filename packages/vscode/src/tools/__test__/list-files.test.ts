import * as assert from "assert";
import * as os from "node:os";
import * as _path from "node:path"; // Renamed to avoid conflict if 'path' is used as a var name
import { after, before, beforeEach, describe, it } from "mocha";
import * as vscode from "vscode";
import type { listFiles as listFilesType } from "../list-files";
import proxyquire from "proxyquire";

// Helper to create a file
async function createFile(uri: vscode.Uri, content = ""): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
}

// Helper to create a directory
async function createDirectory(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

describe("listFiles Tool", () => {
  let testSuiteRootTempDir: vscode.Uri;
  let currentTestTempDirUri: vscode.Uri;
  let currentTestTempDirRelativePath: string;
  let listFiles: typeof listFilesType;

  before(async () => {
    const rootPath = _path.join(
      os.tmpdir(),
      `vscode-ragdoll-listfiles-suite-${Date.now()}`,
    );
    testSuiteRootTempDir = vscode.Uri.file(rootPath);
    await createDirectory(testSuiteRootTempDir).catch(() => {
      /* Ignore if already exists */
    });

    // Use proxyquire to mock getWorkspaceFolder
    const fsMock = {
      getWorkspaceFolder: () => ({
        uri: testSuiteRootTempDir,
        name: "test-workspace",
        index: 0,
      }),
    };

    // Create a proxy to the listFiles module with mocked dependencies
    const listFilesModule = proxyquire("../list-files", {
      "@/lib/fs": fsMock,
    });

    listFiles = listFilesModule.listFiles;
  });

  after(async () => {
    // Clean up the temp directory after all tests
    try {
      await vscode.workspace.fs.delete(testSuiteRootTempDir, {
        recursive: true,
        useTrash: false,
      });
    } catch (error) {
      console.warn("Failed to clean up test temp directory:", error);
    }
  });

  beforeEach(async () => {
    // Create a unique temp subdirectory for each test
    const testDirName = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    currentTestTempDirUri = vscode.Uri.joinPath(testSuiteRootTempDir, testDirName);
    currentTestTempDirRelativePath = testDirName;
    await createDirectory(currentTestTempDirUri);
  });

  it("should list files in a directory", async () => {
    await createFile(vscode.Uri.joinPath(currentTestTempDirUri, "file1.txt"));
    await createFile(vscode.Uri.joinPath(currentTestTempDirUri, "file2.js"));

    const result = await listFiles(
      { path: currentTestTempDirRelativePath, recursive: false },
      { toolCallId: "test-call-id-123", messages: [], cwd: testSuiteRootTempDir.fsPath },
    );

    assert.ok(result.files.some(file => file.includes("file1.txt")));
    assert.ok(result.files.some(file => file.includes("file2.js")));
    assert.strictEqual(result.isTruncated, false);
  });

  it("should list files recursively", async () => {
    await createFile(vscode.Uri.joinPath(currentTestTempDirUri, "file1.txt"));
    
    const subDirUri = vscode.Uri.joinPath(currentTestTempDirUri, "subdir");
    await createDirectory(subDirUri);
    await createFile(vscode.Uri.joinPath(subDirUri, "file2.txt"));

    const result = await listFiles(
      { path: currentTestTempDirRelativePath, recursive: true },
      { toolCallId: "test-call-id-123", messages: [], cwd: testSuiteRootTempDir.fsPath },
    );

    assert.ok(result.files.some(file => file.includes("file1.txt")));
    assert.ok(result.files.some(file => file.includes("subdir") && file.includes("file2.txt")));
    assert.strictEqual(result.isTruncated, false);
  });

  it("should not list files recursively when recursive is false", async () => {
    await createFile(vscode.Uri.joinPath(currentTestTempDirUri, "file1.txt"));
    
    const subDirUri = vscode.Uri.joinPath(currentTestTempDirUri, "subdir");
    await createDirectory(subDirUri);
    await createFile(vscode.Uri.joinPath(subDirUri, "file2.txt"));

    const result = await listFiles(
      { path: currentTestTempDirRelativePath, recursive: false },
      { toolCallId: "test-call-id-123", messages: [], cwd: testSuiteRootTempDir.fsPath },
    );

    assert.ok(result.files.some(file => file.includes("file1.txt")));
    assert.ok(!result.files.some(file => file.includes("file2.txt")));
    assert.strictEqual(result.isTruncated, false);
  });

  it("should handle empty directories", async () => {
    const result = await listFiles(
      { path: currentTestTempDirRelativePath, recursive: false },
      { toolCallId: "test-call-id-123", messages: [], cwd: testSuiteRootTempDir.fsPath },
    );

    assert.deepStrictEqual(result.files, []);
    assert.strictEqual(result.isTruncated, false);
  });

  it("should handle absolute paths", async () => {
    await createFile(vscode.Uri.joinPath(currentTestTempDirUri, "absolute-test.txt"));
    
    const absolutePath = currentTestTempDirUri.fsPath;
    const result = await listFiles(
      { path: absolutePath, recursive: false },
      { toolCallId: "test-call-id-123", messages: [], cwd: testSuiteRootTempDir.fsPath },
    );
    
    assert.ok(result.files.some(file => file.includes("absolute-test.txt")));
    assert.strictEqual(result.isTruncated, false);
  });

  it("should handle abort signal", async () => {
    await createFile(vscode.Uri.joinPath(currentTestTempDirUri, "file1.txt"));
    
    const abortController = new AbortController();
    const promise = listFiles(
      { path: currentTestTempDirRelativePath, recursive: false },
      { toolCallId: "test-call-id-123", messages: [], cwd: testSuiteRootTempDir.fsPath, abortSignal: abortController.signal },
    );
    abortController.abort();
    
    try {
      await promise;
      assert.fail("Should have been aborted");
    } catch (error: any) {
      assert.ok(error.name === "AbortError" || error.message.includes("abort"));
    }
  });
});
