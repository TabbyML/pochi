import type { WebviewPanelInfo } from "@getpochi/common/vscode-webui-bridge";

declare global {
  var POCHI_WEBVIEW_KIND: "sidebar" | "pane";

  var POCHI_PANEL_INFO: WebviewPanelInfo | undefined;
}
