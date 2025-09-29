import * as assert from "assert";
import * as os from "node:os";
import * as _path from "node:path"; // Renamed to avoid conflict if 'path' is used as a var name
import { after, before, beforeEach, describe, it } from "mocha";
import * as vscode from "vscode";
import proxyquire from "proxyquire";
import { readFile } from "../read-file";

// Helper to create a file
async function createFile(uri: vscode.Uri, content = ""): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
}

// Helper to create a directory
async function createDirectory(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

// Dummy options for tool execution context
const dummyToolOptions = {
  toolCallId: "test-call-id-123",
  messages: [], // Provide a minimal message object
  cwd: ""
};

describe("readFile Tool", () => {
  let testSuiteRootTempDir: vscode.Uri;
  let currentTestTempDirUri: vscode.Uri;
  let currentTestTempDirRelativePath: string;
  let readFileWithMock: typeof readFile;

  before(async () => {
    const rootPath = _path.join(
      os.tmpdir(),
      `vscode-ragdoll-readfile-suite-${Date.now()}`,
    );
    testSuiteRootTempDir = vscode.Uri.file(rootPath);
    await createDirectory(testSuiteRootTempDir).catch(() => {
      /* Ignore if already exists */
    });

    // Mock getWorkspaceFolder to return our test root temp dir
    const fsMock = {
      getWorkspaceFolder: () => ({
        uri: testSuiteRootTempDir,
        name: "test-workspace",
        index: 0,
      }),
    };

    readFileWithMock = proxyquire("../read-file", {
      "@/lib/fs": fsMock,
    }).readFile;
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

  it("should read the entire file content when no line parameters are provided", async () => {
    const fileContent = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
    const filePath = _path.join(currentTestTempDirRelativePath, "test.txt");
    const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
    await createFile(fileUri, fileContent);

    const result = await readFileWithMock(
      { path: filePath },
      dummyToolOptions,
    );

    assert.strictEqual(
      result.content,
      "1 | Line 1\n2 | Line 2\n3 | Line 3\n4 | Line 4\n5 | Line 5",
    );
    assert.strictEqual(result.isTruncated, false);
  });

  it("should read specific lines when startLine and endLine are provided", async () => {
    const fileContent = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
    const filePath = _path.join(currentTestTempDirRelativePath, "test.txt");
    const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
    await createFile(fileUri, fileContent);

    const result = await readFileWithMock(
      { path: filePath, startLine: 2, endLine: 4 },
      dummyToolOptions,
    );

    assert.strictEqual(
      result.content,
      "2 | Line 2\n3 | Line 3\n4 | Line 4",
    );
    assert.strictEqual(result.isTruncated, false);
  });

  it("should read from startLine to the end when only startLine is provided", async () => {
    const fileContent = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
    const filePath = _path.join(currentTestTempDirRelativePath, "test.txt");
    const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
    await createFile(fileUri, fileContent);

    const result = await readFileWithMock(
      { path: filePath, startLine: 3 },
      dummyToolOptions,
    );

    assert.strictEqual(
      result.content,
      "3 | Line 3\n4 | Line 4\n5 | Line 5",
    );
    assert.strictEqual(result.isTruncated, false);
  });

  it("should read from beginning to endLine when only endLine is provided", async () => {
    const fileContent = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
    const filePath = _path.join(currentTestTempDirRelativePath, "test.txt");
    const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
    await createFile(fileUri, fileContent);

    const result = await readFileWithMock(
      { path: filePath, endLine: 3 },
      dummyToolOptions,
    );

    assert.strictEqual(
      result.content,
      "1 | Line 1\n2 | Line 2\n3 | Line 3",
    );
    assert.strictEqual(result.isTruncated, false);
  });

  it("should throw an error when the file does not exist", async () => {
    const nonExistentPath = _path.join(currentTestTempDirRelativePath, "non-existent.txt");
    
    try {
      await readFileWithMock(
        { path: nonExistentPath },
        dummyToolOptions,
      );
      assert.fail("Should have thrown an error for non-existent file");
    } catch (error: any) {
      assert.ok(error instanceof Error);
    }
  });

  it("should throw an error when trying to read a binary file", async () => {
    // Create a simple binary file (a PNG header)
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52
    ]);
    const filePath = _path.join(currentTestTempDirRelativePath, "test.png");
    const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
    await vscode.workspace.fs.writeFile(fileUri, pngHeader);

    try {
      await readFileWithMock(
        { path: filePath },
        dummyToolOptions,
      );
      assert.fail("Should have thrown an error for binary file");
    } catch (error: any) {
      assert.ok(
        error.message.includes("binary") || error.message.includes("not plain text"),
        `Unexpected error message: ${error.message}`
      );
    }
  });

  it("should truncate large files to 1MB", async () => {
    // Create a large file (over 1MB)
    const largeLine = "A".repeat(10000); // 10KB per line
    const largeContent = Array(110).fill(largeLine).join("\n"); // ~1.1MB
    
    const filePath = _path.join(currentTestTempDirRelativePath, "large.txt");
    const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
    await createFile(fileUri, largeContent);

    const result = await readFileWithMock(
      { path: filePath },
      dummyToolOptions,
    );

    assert.strictEqual(result.isTruncated, true);
    assert.ok(
      Buffer.byteLength(result.content, "utf-8") <= 1_048_576,
      "Content should be truncated to 1MB"
    );
  });

  it("should handle empty files", async () => {
    const filePath = _path.join(currentTestTempDirRelativePath, "empty.txt");
    const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
    await createFile(fileUri, "");

    const result = await readFileWithMock(
      { path: filePath },
      dummyToolOptions,
    );

    assert.strictEqual(result.content, "1 | ");
    assert.strictEqual(result.isTruncated, false);
  });

  it("should handle files with special characters", async () => {
    const fileContent = "Special chars: áéíóú ñ 你好 😊 \n Second line";
    const filePath = _path.join(currentTestTempDirRelativePath, "special.txt");
    const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
    await createFile(fileUri, fileContent);

    const result = await readFileWithMock(
      { path: filePath },
      dummyToolOptions,
    );

    assert.strictEqual(
      result.content,
      "1 | Special chars: áéíóú ñ 你好 😊 \n2 |  Second line"
    );
    assert.strictEqual(result.isTruncated, false);
  });

  it("should handle abort signal", async () => {
    const fileContent = "Line 1\nLine 2\nLine 3";
    const filePath = _path.join(currentTestTempDirRelativePath, "abort-test.txt");
    const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
    await createFile(fileUri, fileContent);

    const abortController = new AbortController();
    const promise = readFileWithMock(
      { path: filePath },
      { ...dummyToolOptions, abortSignal: abortController.signal },
    );
    
    abortController.abort();
    
    try {
      await promise;
      // Depending on timing, it might complete before abort is processed
      // If it completes, we'll just verify the content
    } catch (error: any) {
      // In Node.js, AbortController.abort() causes the promise to reject with a DOMException 'AbortError'
      assert.ok(
        error.name === "AbortError" ||
        error.message.includes("aborted") ||
        error.message.includes("cancelled"),
        `Unexpected error on abort: ${error.name} - ${error.message}`
      );
    }
  });

  it("should handle absolute paths", async () => {
    const fileContent = "Absolute path test\nLine 2\nLine 3";
    const absoluteFilePath = _path.join(currentTestTempDirUri.fsPath, "absolute-test.txt");
    const fileUri = vscode.Uri.file(absoluteFilePath);
    await createFile(fileUri, fileContent);

    const result = await readFileWithMock(
      { path: absoluteFilePath },
      dummyToolOptions,
    );

    assert.strictEqual(
      result.content,
      "1 | Absolute path test\n2 | Line 2\n3 | Line 3"
    );
    assert.strictEqual(result.isTruncated, false);
  });
});

