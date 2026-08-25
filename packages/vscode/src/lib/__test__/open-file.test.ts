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
): T =>
  new Proxy(target, {
    get: (object, property) =>
      property in overrides ? overrides[property] : Reflect.get(object, property),
  });

const loadOpenFile = (
  vscodeOverrides: Record<PropertyKey, unknown>,
): typeof openFileType => {
  const vscodeMock = overrideObject(vscode, vscodeOverrides);
  return proxyquire("../open-file", {
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
});
