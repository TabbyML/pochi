import { getLogger } from "@getpochi/common";
import type {
  VSCodeHostApi,
  WebviewHostApi,
} from "@getpochi/common/vscode-webui-bridge";
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
        "readLatestCheckpoint",
        "readCheckpointPath",
        "showCheckpointDiff",
        "readExtensionVersion",
        "readVSCodeSettings",
        "updateVSCodeSettings",
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
        "sendTaskNotification",
        "onTaskUpdated",
        "onTaskRunning",
        "readWorktrees",
        "createWorktree",
        "deleteWorktree",
        "readPochiTabs",
        "queryGithubIssues",
        "readGitBranches",
        "readReviews",
        "clearReviews",
        "openReview",
        "readUserEdits",
        "readTasks",
      ],
      exports: {
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
