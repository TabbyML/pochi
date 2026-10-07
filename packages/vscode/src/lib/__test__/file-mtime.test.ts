import * as assert from "node:assert";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";
import sinon from "sinon";
import * as vscode from "vscode";
import type { getVscodeFileMtime as GetVscodeFileMtime } from "../fs";

const loadGetMtime = (stat: sinon.SinonStub): typeof GetVscodeFileMtime =>
  proxyquire
    .noCallThru()
    .noPreserveCache()
    .load("../fs", {
      vscode: {
        Uri: vscode.Uri,
        FileSystemError: vscode.FileSystemError,
        env: vscode.env,
        workspace: { fs: { stat } },
      },
      "node:fs": { existsSync: () => true },
      "./logger": { getLogger: () => ({}) },
    }).getVscodeFileMtime;

describe("getVscodeFileMtime", () => {
  it("returns the file's mtime floored to milliseconds", async () => {
    const stat = sinon.stub().resolves({ mtime: 1234.5 });
    const getMtime = loadGetMtime(stat);

    assert.strictEqual(await getMtime("/tmp/file.txt"), 1234);
    assert.strictEqual(
      stat.firstCall.args[0].fsPath,
      vscode.Uri.file("/tmp/file.txt").fsPath,
    );
  });

  it("returns undefined only for FileNotFound", async () => {
    const getMtime = loadGetMtime(
      sinon.stub().rejects(vscode.FileSystemError.FileNotFound()),
    );

    assert.strictEqual(await getMtime("/tmp/missing.txt"), undefined);
  });

  for (const error of [
    vscode.FileSystemError.NoPermissions(),
    vscode.FileSystemError.Unavailable(),
    new Error("Unexpected provider failure"),
  ]) {
    const label =
      error instanceof vscode.FileSystemError ? error.code : error.message;
    it(`propagates ${label} instead of treating the file as missing`, async () => {
      const getMtime = loadGetMtime(sinon.stub().rejects(error));

      await assert.rejects(
        getMtime("/tmp/file.txt"),
        (actual) => actual === error,
      );
    });
  }
});
