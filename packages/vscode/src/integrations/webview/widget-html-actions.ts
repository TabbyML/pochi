import * as os from "node:os";
import * as vscode from "vscode";

export const WidgetPreviewViewType = "pochi.widgetPreview";

/**
 * Turns a widget title into a filename that is safe to suggest in the save
 * dialog: no path separators, no shell/OS reserved characters, always `.html`.
 */
export function toWidgetHtmlFileName(suggestedFilename: string) {
  const sanitized = suggestedFilename
    .replace(/[^\p{L}\p{N}\-_. ]+/gu, "-")
    .replace(/^[.\-\s]+|[.\-\s]+$/g, "");
  const base = sanitized || "widget";
  return base.toLowerCase().endsWith(".html") ? base : `${base}.html`;
}

/**
 * Prompts for a location and writes the standalone widget document there.
 * The save dialog starts in `cwd` when the caller has a workspace, otherwise
 * in the home directory. Resolves to `false` when the user dismisses the
 * dialog.
 */
export async function saveWidgetHtml(
  html: string,
  suggestedFilename: string,
  cwd?: string | null,
): Promise<boolean> {
  const fileName = toWidgetHtmlFileName(suggestedFilename);
  const baseDir = vscode.Uri.file(cwd || os.homedir());
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(baseDir, fileName),
    filters: { HTML: ["html"] },
  });
  if (!uri) return false;

  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(html));
  return true;
}

/**
 * Renders the standalone widget document in a new editor tab. The document is
 * self-contained, so it is handed to the webview as a plain string and never
 * touches disk. It opens in the active editor group, matching file and image
 * previews opened from the message list.
 */
export function openWidgetPreview(html: string, title: string) {
  const panel = vscode.window.createWebviewPanel(
    WidgetPreviewViewType,
    title,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    },
  );
  panel.webview.html = html;
  return panel;
}
