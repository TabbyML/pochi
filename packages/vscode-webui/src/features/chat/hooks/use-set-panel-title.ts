import { vscodeHost } from "@/lib/vscode";
import type { Task } from "@getpochi/livekit";
import { useEffect } from "react";

export function useSetPanelTitle(task: Task | undefined) {
  useEffect(() => {
    if (task?.title && globalThis.POCHI_WEBVIEW_KIND === "pane") {
      vscodeHost.updatePanelTitle(task, task.title);
    }
  }, [task]);
}
