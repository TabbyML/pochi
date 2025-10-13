import { getLogger } from "@getpochi/common";
import type {
  VSCodeHostApi,
  WebviewHostApi,
} from "@getpochi/common/vscode-webui-bridge";
import type { Store } from "@livestore/livestore";
import { ThreadNestedWindow } from "@quilted/threads";
import * as R from "remeda";
import type { WebviewApi } from "vscode-webview";
import { type TaskSyncData, taskSyncEmitter } from "../livestore-provider";
import { queryClient } from "./query-client";

const logger = getLogger("vscode");

let vscodeApi: WebviewApi<unknown> | undefined | null = undefined;

function getVSCodeApi() {
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
        "readEnvironment",
        "executeToolCall",
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
        "showInformationMessage",
        "readVisibleTerminals",
        "readModelList",
        "readUserStorage",
        "readCustomAgents",
        "readMachineId",
        "openTaskInPanel",
        "bridgeStoreEvent",
      ],
      exports: {
        async openTask(params) {
          if (globalThis.POCHI_WEBVIEW_KIND === "pane" && "task" in params) {
            // wait for store to be ready
            await new Promise((resolve) => setTimeout(resolve, 100));
            taskSyncEmitter.emit("taskSync", params.task as TaskSyncData);
          }
          window.router.navigate({
            to: "/",
            search: {
              uid: params.uid || crypto.randomUUID(),
              prompt: "prompt" in params ? params.prompt : undefined,
              files: "files" in params ? params.files : undefined,
            },
            replace: true,
          });
        },

        openTaskList() {
          window.router.navigate({
            to: "/tasks",
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

        async commitStoreEvent(event: unknown) {
          if (globalThis.POCHI_WEBVIEW_KIND === "pane") return;
          if (R.isObjectType(event)) {
            const dateFields = ["createdAt", "updatedAt"];
            for (const field of dateFields) {
              if (
                "args" in event &&
                R.isPlainObject(event.args) &&
                R.isString(event.args[field])
              ) {
                event.args[field] = new Date(event.args[field]);
              }
            }
          }
          // @ts-expect-error
          store?.commit(event);
        },
      },
    },
  );

  return thread.imports;
}

export const vscodeHost = createVSCodeHost();
