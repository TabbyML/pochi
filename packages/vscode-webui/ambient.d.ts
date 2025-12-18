import type { PochiTaskInfo } from "@getpochi/common/vscode-webui-bridge";

declare global {
  var POCHI_WEBVIEW_KIND: "sidebar" | "pane";

  var POCHI_TASK_INFO: PochiTaskInfo | undefined;
}
