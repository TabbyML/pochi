import { getLogger } from "@getpochi/common";
import type {
  VSCodeHostApi,
  WebviewHostApi,
} from "@getpochi/common/vscode-webui-bridge";
import { taskCatalog } from "@getpochi/livekit";
import type { Store } from "@livestore/livestore";
import { Schema } from "@livestore/utils/effect";
import { ThreadNestedWindow } from "@quilted/threads";
import Emittery from "emittery";
import type { WebviewApi } from "vscode-webview";

import { queryClient } from "./query-client";

const logger = getLogger("vscode");

let vscodeApi: WebviewApi<unknown> | undefined | null = undefined;

export function getVSCodeApi() {
  if (vscodeApi) {
    return vscodeApi;
  }

  if (vscodeApi === null) {
    return null;
  }

  try {
    vscodeApi = acquireVsCodeApi();
  } catch (error) {
    logger.warn(
      "Failed to acquire VSCode API. This is likely due to running in a non-VSCode environment.",
      error,
    );
    vscodeApi = null;
  }
  return vscodeApi;
}

export function isVSCodeEnvironment() {
  const vscodeApi = getVSCodeApi();
  return !!vscodeApi?.getState;
}

let store: Store | null = null;
export function setActiveStore(newStore: Store | null): void {
  store = newStore;
}

function createVSCodeHost(): VSCodeHostApi {
  const vscode = getVSCodeApi();

  const thread = new ThreadNestedWindow<VSCodeHostApi, WebviewHostApi>(
    vscode as unknown as Window,
    {
      imports: [
        "readPochiCredentials",
        "getSessionState",
        "setSessionState",
        "getWorkspaceState",
        "setWorkspaceState",
        "getGlobalState",
        "setGlobalState",
        "readEnvironment",
        "executeToolCall",
        "executeBashCommand",
        "listFilesInWorkspace",
        "listAutoCompleteCandidates",
        "readActiveTabs",
        "readActiveSelection",
        "readCurrentWorkspace",
        "previewToolCall",
        "openFile",
        "readResourceURI",
        "listRuleFiles",
        "listWorkflows",
        "capture",
        "readMcpStatus",
        "fetchThirdPartyRules",
        "fetchAvailableThirdPartyMcpConfigs",
        "openExternal",
        "readMinionId",
        "saveCheckpoint",
        "restoreCheckpoint",
        "readCheckpointPath",
        "showCheckpointDiff",
        "readExtensionVersion",
        "readAutoSaveDisabled",
        "diffWithCheckpoint",
        "diffChangedFiles",
        "showChangedFiles",
        "restoreChangedFiles",
        "showInformationMessage",
        "readVisibleTerminals",
        "readModelList",
        "readUserStorage",
        "readCustomAgents",
        "openTaskInPanel",
        "isTaskPanelVisible",
        "onTaskUpdated",
        "onTaskRunning",
        "readWorktrees",
        "createWorktree",
        "readPochiTasks",
      ],
      exports: {
        async openTask(params) {
          window.router.navigate({
            to: "/task",
            search: {
              uid: params.uid || crypto.randomUUID(),
              storeId: "storeId" in params ? params.storeId : undefined,
              prompt: "prompt" in params ? params.prompt : undefined,
              files: "files" in params ? params.files : undefined,
            },
            replace: true,
          });
        },

        openTaskList() {
          window.router.navigate({
            to: "/",
            replace: true,
          });
        },

        openSettings() {
          window.router.navigate({
            to: "/settings",
            replace: true,
          });
        },

        onAuthChanged() {
          queryClient.resetQueries();
        },

        async isFocused() {
          return window.document.hasFocus();
        },

        async commitTaskUpdated(inputArgs: unknown) {
          if (globalThis.POCHI_WEBVIEW_KIND === "pane") return;
          const args = Schema.decodeUnknownSync(
            taskCatalog.events.tastUpdated.schema,
          )(inputArgs);
          store?.commit(taskCatalog.events.tastUpdated(args));
        },

        onFileChanged(filePath: string, content: string) {
          fileChangeEvent.emit("fileChanged", { filepath: filePath, content });
        },
      },
    },
  );

  return thread.imports;
}

export const vscodeHost = createVSCodeHost();

export const fileChangeEvent = new Emittery<{
  fileChanged: { filepath: string; content: string };
}>();
