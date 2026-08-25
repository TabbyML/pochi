import * as assert from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "mocha";
import proxyquire from "proxyquire";
import sinon from "sinon";
import * as vscode from "vscode";
import type { openFile as openFileType } from "../open-file";

const overrideObject = <T extends object>(
  target: T,
  overrides: Record<PropertyKey, unknown>,
): T => {
  const descriptors = Object.fromEntries(
    Reflect.ownKeys(overrides).map((property) => [
      property,
      {
        configurable: true,
        enumerable: true,
        value: overrides[property],
        writable: true,
      },
    ]),
  );
  return Object.create(target, descriptors);
};

const loadOpenFile = (
  vscodeOverrides: Record<PropertyKey, unknown>,
): typeof openFileType => {
  const vscodeMock = overrideObject(vscode, vscodeOverrides);
  return proxyquire
    .noCallThru()
    .noPreserveCache()
    .load("../open-file", {
      "@/lib/logger": {
        getLogger: () => ({
          info: sinon.stub(),
          error: sinon.stub(),
        }),
      },
      "@getpochi/common/tool-utils": {
        isPlainTextFile: sinon.stub().resolves(true),
      },
      vscode: vscodeMock,
    }).openFile;
};

describe("openFile", () => {
  let testDirectory: vscode.Uri;

  before(async () => {
    testDirectory = vscode.Uri.file(
      path.join(os.tmpdir(), `pochi-open-file-${Date.now()}`),
    );
    await vscode.workspace.fs.createDirectory(testDirectory);
  });

  after(async () => {
    await vscode.workspace.fs.delete(testDirectory, {
      recursive: true,
      useTrash: false,
    });
  });

  it("does not classify an error opening an existing directory as missing", async () => {
    const openError = new Error("Failed to reveal directory");
    const showErrorMessage = sinon.stub();
    const executeCommand = sinon.stub().rejects(openError);
    const openFile = loadOpenFile({
      commands: overrideObject(vscode.commands, { executeCommand }),
      window: overrideObject(vscode.window, { showErrorMessage }),
    });

    await assert.rejects(
      openFile(testDirectory.fsPath, undefined),
      openError,
    );
    assert.strictEqual(showErrorMessage.called, false);
  });

  it("shows a non-blocking error when the file and glob fallback are missing", async () => {
    const missingName = `missing-${Date.now()}`;
    const missingPath = vscode.Uri.joinPath(testDirectory, missingName).fsPath;
    const showErrorMessage = sinon.stub().returns(new Promise(() => {}));
    const openFile = loadOpenFile({
      window: overrideObject(vscode.window, { showErrorMessage }),
    });

    await Promise.race([
      openFile(missingPath, undefined, {
        fallbackGlobPattern: `**/${missingName}`,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("openFile did not complete")), 3_000),
      ),
    ]);

    assert.strictEqual(
      showErrorMessage.calledOnceWithExactly(`File not found: ${missingPath}`),
      true,
    );
  });

  it("does not run missing-file fallbacks for other file system errors", async () => {
    const filePath = vscode.Uri.joinPath(testDirectory, "restricted").fsPath;
    const stat = sinon
      .stub()
      .rejects(vscode.FileSystemError.NoPermissions(filePath));
    const findFiles = sinon.stub();
    const showErrorMessage = sinon.stub();
    const openFile = loadOpenFile({
      workspace: overrideObject(vscode.workspace, {
        fs: overrideObject(vscode.workspace.fs, { stat }),
        findFiles,
      }),
      window: overrideObject(vscode.window, { showErrorMessage }),
    });

    await openFile(filePath, undefined, { fallbackGlobPattern: "**/*" });

    assert.strictEqual(stat.calledOnce, true);
    assert.strictEqual(findFiles.called, false);
    assert.deepStrictEqual(showErrorMessage.args, [
      [`No permissions to access file: ${filePath}`],
    ]);
  });

  it("opens empty base64 content without showing a missing-file error", async () => {
    const filePath = vscode.Uri.joinPath(testDirectory, "empty.txt").fsPath;
    const stat = sinon.stub().rejects(vscode.FileSystemError.FileNotFound());
    const writeFile = sinon.stub().resolves();
    const executeCommand = sinon.stub().resolves();
    const showErrorMessage = sinon.stub();
    const openFile = loadOpenFile({
      commands: overrideObject(vscode.commands, { executeCommand }),
      workspace: overrideObject(vscode.workspace, {
        fs: overrideObject(vscode.workspace.fs, { stat, writeFile }),
      }),
      window: overrideObject(vscode.window, { showErrorMessage }),
    });

    await openFile(filePath, undefined, { base64Data: "" });

    assert.strictEqual(stat.calledOnce, true);
    assert.strictEqual(writeFile.calledOnce, true);
    assert.strictEqual(writeFile.firstCall.args[1].byteLength, 0);
    assert.strictEqual(
      executeCommand.calledOnceWithExactly(
        "vscode.open",
        writeFile.firstCall.args[0],
      ),
      true,
    );
    assert.strictEqual(showErrorMessage.called, false);
  });
});
