import { getLogger } from "@getpochi/common";
import { decodeStoreId } from "@getpochi/common/store-id-utils";
import { browserSessionManager } from "./browser-session-manager";
import { vscodeHost } from "./vscode";

const logger = getLogger("BrowserSession");

/** Prepare the recorder before the first command in a browser subtask. */
export async function prepareBrowserSession(
  taskId: string,
  storeId: string,
  isCancelled: () => boolean,
) {
  if (isCancelled() || browserSessionManager.isRegistered(taskId)) return;
  try {
    const { browserSettings } = await vscodeHost.readBrowserAgentSettings();
    if (isCancelled()) return;
    const settings = browserSettings.initial;
    await browserSessionManager.registerSession(
      taskId,
      decodeStoreId(storeId).taskId,
      {
        viewport:
          settings.runtime.mode === "managed"
            ? settings.managedBrowser.viewport
            : undefined,
      },
    );
  } catch (error) {
    logger.warn({ taskId, error }, "Failed to register browser session");
  }
}
