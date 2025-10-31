declare namespace globalThis {
  // biome-ignore lint/style/noVar: <explanation>
  var POCHI_WEBVIEW_KIND: "sidebar" | "pane";

  // biome-ignore lint/style/noVar: <explanation>
  var POCHI_TASK_PARAMS: TaskParams | undefined;

  interface TaskParams {
    cwd: string;
    uid?: string;
  }
}
