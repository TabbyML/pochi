import * as assert from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "mocha";
import * as vscode from "vscode";
import { readImagePreview } from "../read-image-preview";

// 1x1 transparent PNG
const TinyPngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nxoAAAAASUVORK5CYII=",
  "base64",
);

describe("readImagePreview", () => {
  let testDir: vscode.Uri;

  before(async () => {
    const dirPath = path.join(
      os.tmpdir(),
      `pochi-read-image-preview-test-${Date.now()}`,
    );
    testDir = vscode.Uri.file(dirPath);
    await vscode.workspace.fs.createDirectory(testDir);
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(testDir, "preview.png"),
      TinyPngBytes,
    );
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(testDir, "notes.txt"),
      Buffer.from("hello world"),
    );
  });

  after(async () => {
    await vscode.workspace.fs.delete(testDir, {
      recursive: true,
      useTrash: false,
    });
  });

  it("reads a relative image path against cwd and returns a data URL", async () => {
    const result = await readImagePreview("preview.png", testDir.fsPath);
    assert.ok(result);
    assert.ok(result.dataUrl.startsWith("data:image/png;base64,"));
    assert.strictEqual(
      result.dataUrl,
      `data:image/png;base64,${TinyPngBytes.toString("base64")}`,
    );
  });

  it("reads an absolute image path", async () => {
    const absPath = path.join(testDir.fsPath, "preview.png");
    const result = await readImagePreview(absPath, null);
    assert.ok(result);
    assert.ok(result.dataUrl.startsWith("data:image/png;base64,"));
  });

  it("returns null for non-image files", async () => {
    const result = await readImagePreview("notes.txt", testDir.fsPath);
    assert.strictEqual(result, null);
  });

  it("returns null for missing files", async () => {
    const result = await readImagePreview("missing.png", testDir.fsPath);
    assert.strictEqual(result, null);
  });
});
