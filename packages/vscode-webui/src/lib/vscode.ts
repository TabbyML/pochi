import { getLogger } from "@getpochi/common";
import type {
  ExecuteCommandResult,
  VSCodeHostApi,
  WebviewHostApi,
} from "@getpochi/common/vscode-webui-bridge";
import {
  catalog,
  extractTaskResult,
  getTaskErrorMessage,
  mapTaskStatusToBackgroundStatus,
} from "@getpochi/livekit";
import { ThreadNestedWindow } from "@quilted/threads";
import type { WebviewApi } from "vscode-webview";
import { queryClient } from "./query-client";
import type { useDefaultStore } from "./use-default-store";

const logger = getLogger("vscode");

let globalStore: ReturnType<typeof useDefaultStore> | null = null;
export function setGlobalStore(
  store: ReturnType<typeof useDefaultStore> | null,
) {
  globalStore = store;
}

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
        "restoreChangedFiles",
        "showInformationMessage",
        "readVisibleTerminals",
        "readModelList",
        "readUserStorage",
        "readCustomAgents",
        "readSkills",
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
        "readBrowserSession",
        "registerBrowserSession",
        "unregisterBrowserSession",
        "readMcpConfigOverride",
        "readTaskArchived",
        "readLang",
        "readForkTaskStatus",
        "readTaskChangedFiles",
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

        async writeTaskFile(taskId: string, filePath: string, content: string) {
          if (!globalStore) {
            logger.warn("Global store not set, cannot update file");
            return;
          }

          if (filePath === "/plan.md") {
            globalStore.commit(
              catalog.events.writeTaskFile({
                taskId,
                filePath,
                content,
              }),
            );
          } else {
            logger.warn(
              `Ignoring writeTaskFile for unsupported path: ${filePath}`,
            );
            throw new Error(`Filepath ${filePath} is not accessible`);
          }
        },

        async readTaskOutput(taskId: string): Promise<ExecuteCommandResult> {
          if (!globalStore) {
            logger.warn("Global store not set, cannot query task output");
            return {
              content: "",
              status: "idle",
              isTruncated: false,
              error: "Webview store not ready",
            };
          }

          const task = globalStore.query(catalog.queries.makeTaskQuery(taskId));
          if (!task) {
            return {
              content: "",
              status: "idle",
              isTruncated: false,
              error: `Task with ID "${taskId}" not found.`,
            };
          }

          const status = mapTaskStatusToBackgroundStatus(task.status);
          if (status !== "completed") {
            return {
              content:
                "The task is currently running. You can continue with other operations while it executes in the background. If you need to wait for the task to complete, you can use the `executeCommand` tool with `sleep`.",
              status,
              isTruncated: false,
            };
          }

          let content: string | undefined;
          let outputError: string | undefined;
          try {
            content = extractTaskResult(globalStore, taskId);
          } catch (error) {
            logger.warn("Failed to extract task result", error);
            outputError =
              "The task has completed, but the output is not yet available.";
          }
          const error =
            task.status === "failed"
              ? (getTaskErrorMessage(task.error) ?? "The task failed.")
              : content
                ? undefined
                : (outputError ??
                  "The task completed successfully, but no result was returned via the attemptCompletion tool.");

          return {
            content: content ?? "",
            status,
            isTruncated: false,
            error,
          };
        },

        async readTaskFile(taskId: string, filePath: string) {
          if (!globalStore) {
            logger.warn("Global store not set, cannot read file");
            return null;
          }

          const file = globalStore.query(
            catalog.queries.makeFileQuery(taskId, filePath),
          );
          return file?.content ?? null;
        },
      },
    },
  );

  return thread.imports;
}

export const vscodeHost = createVSCodeHost();
