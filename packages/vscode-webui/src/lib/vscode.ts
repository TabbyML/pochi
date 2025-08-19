import { getLogger } from "@getpochi/common";
import type {
  VSCodeHostApi,
  WebviewHostApi,
} from "@getpochi/common/vscode-webui-bridge";
import { ThreadNestedWindow } from "@quilted/threads";
import type { WebviewApi } from "vscode-webview";
import { queryClient } from "./query-client";

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

function createVSCodeHost(): VSCodeHostApi {
  const vscode = getVSCodeApi();

  const thread = new ThreadNestedWindow<VSCodeHostApi, WebviewHostApi>(
    vscode as unknown as Window,
    {
      imports: [
        "readToken",
        "getSessionState",
        "setSessionState",
        "getWorkspaceState",
        "setWorkspaceState",
        "readEnvironment",
        "executeToolCall",
        "listFilesInWorkspace",
        "openSymbol",
        "readActiveTabs",
        "readActiveSelection",
        "readCurrentWorkspace",
        "previewToolCall",
        "openFile",
        "readResourceURI",
        "listRuleFiles",
        "listWorkflowsInWorkspace",
        "capture",
        "closeCurrentWorkspace",
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
        "readCustomModelSetting",
        "readVSCodeModels",
        "vscodeLmRequest",
      ],
      exports: {
        openTask(params) {
          window.router.navigate({
            to: "/",
            search: {
              uid: params.uid,
              prompt: "prompt" in params ? params.prompt : undefined,
              ts: Date.now(),
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
      },
    },
  );

  return thread.imports;
}

export const vscodeHost = createVSCodeHost();

const logger = getLogger("vscode");
