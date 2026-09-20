import * as assert from "node:assert";
import * as os from "node:os";
import { afterEach, describe, it } from "mocha";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
  openWidgetPreview,
  saveWidgetHtml,
  toWidgetHtmlFileName,
} from "../widget-html-actions";

describe("widget html actions", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("toWidgetHtmlFileName", () => {
    it("appends the html extension", () => {
      assert.strictEqual(toWidgetHtmlFileName("sales chart"), "sales chart.html");
    });

    it("keeps an existing html extension", () => {
      assert.strictEqual(toWidgetHtmlFileName("widget.HTML"), "widget.HTML");
    });

    it("strips path separators and reserved characters", () => {
      assert.strictEqual(
        toWidgetHtmlFileName("../a/b:c?d*e|f"),
        "a-b-c-d-e-f.html",
      );
    });

    it("keeps non-latin letters", () => {
      // Escaped on purpose: test sources stay ASCII-only.
      const nonLatin = "\u9500\u552e";
      assert.strictEqual(toWidgetHtmlFileName(nonLatin), `${nonLatin}.html`);
    });

    it("falls back to a default name", () => {
      assert.strictEqual(toWidgetHtmlFileName("///"), "widget.html");
    });
  });

  describe("saveWidgetHtml", () => {
    it("writes the document to the picked location", async () => {
      const target = vscode.Uri.joinPath(
        vscode.Uri.file(os.tmpdir()),
        `pochi-widget-${Date.now()}.html`,
      );
      sinon.stub(vscode.window, "showSaveDialog").resolves(target);

      const saved = await saveWidgetHtml("<!doctype html><p>hi</p>", "chart");

      try {
        assert.strictEqual(saved, true);
        const written = await vscode.workspace.fs.readFile(target);
        assert.strictEqual(
          Buffer.from(written).toString("utf8"),
          "<!doctype html><p>hi</p>",
        );
      } finally {
        await vscode.workspace.fs.delete(target);
      }
    });

    it("suggests a sanitized filename", async () => {
      const showSaveDialog = sinon
        .stub(vscode.window, "showSaveDialog")
        .resolves(undefined);

      await saveWidgetHtml("<p>hi</p>", "a/b");

      const options = showSaveDialog.firstCall.args[0];
      assert.ok(options?.defaultUri?.path.endsWith("/a-b.html"));
    });

    it("starts the dialog in the provided workspace directory", async () => {
      const showSaveDialog = sinon
        .stub(vscode.window, "showSaveDialog")
        .resolves(undefined);

      await saveWidgetHtml("<p>hi</p>", "chart", os.tmpdir());

      const options = showSaveDialog.firstCall.args[0];
      assert.strictEqual(
        options?.defaultUri?.path,
        vscode.Uri.joinPath(vscode.Uri.file(os.tmpdir()), "chart.html").path,
      );
    });

    it("returns false when the dialog is dismissed", async () => {
      sinon.stub(vscode.window, "showSaveDialog").resolves(undefined);

      assert.strictEqual(await saveWidgetHtml("<p>hi</p>", "chart"), false);
    });
  });

  describe("openWidgetPreview", () => {
    it("renders the document string in a new webview panel", () => {
      const panel = openWidgetPreview("<!doctype html><p>preview</p>", "Chart");

      try {
        assert.strictEqual(panel.title, "Chart");
        assert.strictEqual(panel.viewType, "pochi.widgetPreview");
        assert.strictEqual(panel.webview.options.enableScripts, true);
        assert.strictEqual(panel.webview.html, "<!doctype html><p>preview</p>");
      } finally {
        panel.dispose();
      }
    });

    it("opens in the active editor group", () => {
      const createWebviewPanel = sinon.spy(vscode.window, "createWebviewPanel");

      const panel = openWidgetPreview("<p>preview</p>", "Chart");

      try {
        assert.strictEqual(
          createWebviewPanel.firstCall.args[2],
          vscode.ViewColumn.Active,
        );
      } finally {
        panel.dispose();
      }
    });
  });
});
