import * as assert from "assert";
import * as os from "node:os";
import * as _path from "node:path";
import { after, before, beforeEach, describe, it } from "mocha";
import * as vscode from "vscode";
import proxyquire from "proxyquire";
import { previewWriteToFile, writeToFile } from "../write-to-file";

async function createFile(uri: vscode.Uri, content = ""): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
}

async function createDirectory(uri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.createDirectory(uri);
}

describe("writeToFile Tool", () => {
  let testSuiteRootTempDir: vscode.Uri;
  let currentTestTempDirUri: vscode.Uri;
  let currentTestTempDirRelativePath: string;
  let writeToFileWithMock: typeof writeToFile;
  let previewWriteToFileWithMock: typeof previewWriteToFile;

  before(async () => {
    const rootPath = _path.join(
      os.tmpdir(),
      `vscode-ragdoll-writetofile-suite-${Date.now()}`,
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

    const module = proxyquire("../write-to-file", {
      "@/lib/fs": fsMock,
    });
    writeToFileWithMock = module.writeToFile;
    previewWriteToFileWithMock = module.previewWriteToFile;
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

  describe("writeToFile", () => {
    it("should create a new file", async () => {
      const filePath = _path.join(
        currentTestTempDirRelativePath,
        "new-file.txt",
      );
      const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
      const content = "Hello, World!";

      const result = await writeToFileWithMock(
        {
          path: filePath,
          content: content,
        },
        {
          toolCallId: "test-call-id-123",
          messages: [],
          cwd: testSuiteRootTempDir.fsPath,
        },
      );

      assert.strictEqual(result.success, true);
      const fileContent = await vscode.workspace.fs.readFile(fileUri);
      assert.strictEqual(fileContent.toString(), content);
    });

    it("should overwrite existing file", async () => {
      const filePath = _path.join(
        currentTestTempDirRelativePath,
        "existing-file.txt",
      );
      const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
      const originalContent = "Original content";
      const newContent = "New content";

      await createFile(fileUri, originalContent);

      const result = await writeToFileWithMock(
        {
          path: filePath,
          content: newContent,
        },
        {
          toolCallId: "test-call-id-123",
          messages: [],
          cwd: testSuiteRootTempDir.fsPath,
        },
      );

      assert.strictEqual(result.success, true);
      const fileContent = await vscode.workspace.fs.readFile(fileUri);
      assert.strictEqual(fileContent.toString(), newContent);
    });

    it("should create nested directories automatically", async () => {
      const filePath = _path.join(
        currentTestTempDirRelativePath,
        "nested",
        "directory",
        "file.txt",
      );
      const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
      const content = "Nested file content";

      const result = await writeToFileWithMock(
        {
          path: filePath,
          content: content,
        },
        {
          toolCallId: "test-call-id-123",
          messages: [],
          cwd: testSuiteRootTempDir.fsPath,
        },
      );

      assert.strictEqual(result.success, true);
      const fileContent = await vscode.workspace.fs.readFile(fileUri);
      assert.strictEqual(fileContent.toString(), content);
    });

    it("should handle absolute paths", async () => {
      const absoluteFilePath = _path.join(
        currentTestTempDirUri.fsPath,
        "absolute-path-file.txt",
      );
      const fileUri = vscode.Uri.file(absoluteFilePath);
      const content = "Absolute path content";

      const result = await writeToFileWithMock(
        {
          path: absoluteFilePath,
          content: content,
        },
        {
          toolCallId: "test-call-id-123",
          messages: [],
          cwd: testSuiteRootTempDir.fsPath,
        },
      );

      assert.strictEqual(result.success, true);
      const fileContent = await vscode.workspace.fs.readFile(fileUri);
      assert.strictEqual(fileContent.toString(), content);
    });

    it("should preserve line endings", async () => {
      const filePath = _path.join(
        currentTestTempDirRelativePath,
        "line-endings.txt",
      );
      const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
      const content = "Line 1\nLine 2\nLine 3";

      const result = await writeToFileWithMock(
        {
          path: filePath,
          content: content,
        },
        {
          toolCallId: "test-call-id-123",
          messages: [],
          cwd: testSuiteRootTempDir.fsPath,
        },
      );

      assert.strictEqual(result.success, true);
      const fileContent = await vscode.workspace.fs.readFile(fileUri);
      assert.ok(fileContent.toString().includes("Line 1"));
      assert.ok(fileContent.toString().includes("Line 2"));
      assert.ok(fileContent.toString().includes("Line 3"));
    });

    it("should handle empty content", async () => {
      const filePath = _path.join(
        currentTestTempDirRelativePath,
        "empty-file.txt",
      );
      const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
      const content = "";

      const result = await writeToFileWithMock(
        {
          path: filePath,
          content: content,
        },
        {
          toolCallId: "test-call-id-123",
          messages: [],
          cwd: testSuiteRootTempDir.fsPath,
        },
      );

      assert.strictEqual(result.success, true);
      const fileContent = await vscode.workspace.fs.readFile(fileUri);
      // Empty file should still exist
      assert.strictEqual(fileContent.toString().length, 0);
    });

    it("should include edit metadata", async () => {
      const filePath = _path.join(
        currentTestTempDirRelativePath,
        "metadata-file.txt",
      );
      const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
      const originalContent = "Line 1\nLine 2\nLine 3";
      const newContent = "Line 1\nModified Line 2\nLine 3\nLine 4";

      await createFile(fileUri, originalContent);

      const result = await writeToFileWithMock(
        {
          path: filePath,
          content: newContent,
        },
        {
          toolCallId: "test-call-id-123",
          messages: [],
          cwd: testSuiteRootTempDir.fsPath,
        },
      );

      assert.strictEqual(result.success, true);
      assert.ok(result._meta);
      assert.ok(result._meta.edit);
      assert.ok(result._meta.editSummary);
      assert.ok(result._meta.editSummary.added > 0);
      assert.ok(result._meta.editSummary.removed > 0);
    });

    it("should handle Unicode content", async () => {
      const filePath = _path.join(
        currentTestTempDirRelativePath,
        "unicode-file.txt",
      );
      const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
      const content = "Hello 世界! 🚀 Emoji test ñ é ü";

      const result = await writeToFileWithMock(
        {
          path: filePath,
          content: content,
        },
        {
          toolCallId: "test-call-id-123",
          messages: [],
          cwd: testSuiteRootTempDir.fsPath,
        },
      );

      assert.strictEqual(result.success, true);
      const fileContent = await vscode.workspace.fs.readFile(fileUri);
      assert.strictEqual(fileContent.toString(), content);
    });
  });

  describe("previewWriteToFile", () => {
    it("should preview creating a new file", async () => {
      const filePath = _path.join(
        currentTestTempDirRelativePath,
        "preview-new-file.txt",
      );
      const content = "Preview content";

      const result = await previewWriteToFileWithMock(
        {
          path: filePath,
          content: content,
        },
        {
          state: "call",
          toolCallId: "test-call-id-123",
          cwd: testSuiteRootTempDir.fsPath,
        },
      );

      assert.ok(result);
      assert.ok("success" in result && result.success);
      assert.ok("_meta" in result && result._meta);
      assert.ok("_meta" in result && result._meta?.edit);
      assert.ok("_meta" in result && result._meta?.editSummary);
    });

    it("should preview overwriting an existing file", async () => {
      const filePath = _path.join(
        currentTestTempDirRelativePath,
        "preview-existing-file.txt",
      );
      const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
      const originalContent = "Original content";
      const newContent = "New content";

      await createFile(fileUri, originalContent);

      const result = await previewWriteToFileWithMock(
        {
          path: filePath,
          content: newContent,
        },
        {
          state: "call",
          toolCallId: "test-call-id-123",
          cwd: testSuiteRootTempDir.fsPath,
        },
      );

      assert.ok(result);
      assert.ok("success" in result && result.success);
      assert.ok("_meta" in result && result._meta);
      assert.ok("_meta" in result && result._meta?.edit);
      assert.ok("_meta" in result && result._meta?.editSummary);
      // File should not be modified by preview
      const fileContent = await vscode.workspace.fs.readFile(fileUri);
      assert.strictEqual(fileContent.toString(), originalContent);
    });

    it("should preview with correct edit summary for new file", async () => {
      const filePath = _path.join(
        currentTestTempDirRelativePath,
        "preview-new-with-summary.txt",
      );
      const content = "Line 1\nLine 2\nLine 3";

      const result = await previewWriteToFileWithMock(
        {
          path: filePath,
          content: content,
        },
        {
          state: "call",
          toolCallId: "test-call-id-123",
          cwd: testSuiteRootTempDir.fsPath,
        },
      );

      assert.ok(result);
      assert.ok("success" in result && result.success);
      assert.ok("_meta" in result && result._meta?.editSummary);
      // New file should show all lines as added
      if ("_meta" in result && result._meta?.editSummary) {
        assert.ok(result._meta.editSummary.added > 0);
        assert.strictEqual(result._meta.editSummary.removed, 0);
      }
    });

    it("should preview with correct edit summary for modified file", async () => {
      const filePath = _path.join(
        currentTestTempDirRelativePath,
        "preview-modified-with-summary.txt",
      );
      const fileUri = vscode.Uri.joinPath(testSuiteRootTempDir, filePath);
      const originalContent = "Line 1\nLine 2\nLine 3";
      const newContent = "Line 1\nModified Line 2\nLine 3\nLine 4";

      await createFile(fileUri, originalContent);

      const result = await previewWriteToFileWithMock(
        {
          path: filePath,
          content: newContent,
        },
        {
          state: "call",
          toolCallId: "test-call-id-123",
          cwd: testSuiteRootTempDir.fsPath,
        },
      );

      assert.ok(result);
      assert.ok("success" in result && result.success);
      assert.ok("_meta" in result && result._meta?.editSummary);
      // Modified file should show both additions and removals
      if ("_meta" in result && result._meta?.editSummary) {
        assert.ok(result._meta.editSummary.added > 0);
        assert.ok(result._meta.editSummary.removed > 0);
      }
    });

    it("should return error when path is undefined", async () => {
      const result = await previewWriteToFileWithMock(
        {
          path: undefined,
          content: "Some content",
        },
        {
          state: "call",
          toolCallId: "test-call-id-123",
          cwd: testSuiteRootTempDir.fsPath,
        },
      );

      assert.ok(result);
      assert.ok("error" in result);
      assert.strictEqual(
        result.error,
        "Invalid arguments for previewing writeToFile tool.",
      );
    });

    it("should return error when content is undefined", async () => {
      const result = await previewWriteToFileWithMock(
        {
          path: "test.txt",
          content: undefined,
        },
        {
          state: "call",
          toolCallId: "test-call-id-123",
          cwd: testSuiteRootTempDir.fsPath,
        },
      );

      assert.ok(result);
      assert.ok("error" in result);
      assert.strictEqual(
        result.error,
        "Invalid arguments for previewing writeToFile tool.",
      );
    });

    it("should handle deeply nested new file paths in preview mode", async () => {
      const filePath = _path.join(
        currentTestTempDirRelativePath,
        "deep",
        "nested",
        "path",
        "to",
        "file.txt",
      );
      const content = "Deeply nested content";

      const result = await previewWriteToFileWithMock(
        {
          path: filePath,
          content: content,
        },
        {
          state: "call",
          toolCallId: "test-call-id-123",
          cwd: testSuiteRootTempDir.fsPath,
        },
      );

      assert.ok(result);
      assert.ok("success" in result && result.success);
      assert.ok("_meta" in result && result._meta);
    });
  });
});