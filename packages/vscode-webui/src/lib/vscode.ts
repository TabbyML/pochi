import { getLogger } from "@getpochi/common";
import type {
  TaskOutputResult,
  VSCodeHostApi,
  WebviewHostApi,
} from "@getpochi/common/vscode-webui-bridge";
import { catalog } from "@getpochi/livekit";
import { ThreadNestedWindow } from "@quilted/threads";
import Emittery from "emittery";
import type { WebviewApi } from "vscode-webview";
import { extractTaskResult } from "../features/chat/lib/tool-call-life-cycle";
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
        "readMcpConfigOverride",
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

        async writeTaskFile(taskId: string, filePath: string, content: string) {
          if (!globalStore) {
            logger.warn("Global store not set, cannot update file");
            return;
          }

          globalStore.commit(
            catalog.events.writeTaskFile({
              taskId,
              filePath,
              content,
            }),
          );
        },

        async queryTaskOutput(taskId: string): Promise<TaskOutputResult> {
          if (!globalStore) {
            logger.warn("Global store not set, cannot query task output");
            return {
              output: "",
              status: "idle",
              isTruncated: false,
              error: "Webview store not ready",
            };
          }

          const task = globalStore.query(catalog.queries.makeTaskQuery(taskId));
          if (!task) {
            return {
              output: "",
              status: "idle",
              isTruncated: false,
              error: `Task with ID "${taskId}" not found.`,
            };
          }

          const status = mapTaskStatus(task.status);
          if (status !== "completed") {
            return {
              output:
                "Task still running, you can continue working while async tasks run",
              status,
              isTruncated: false,
            };
          }

          let output: string | undefined;
          let outputError: string | undefined;
          try {
            output = extractTaskResult(globalStore, taskId);
          } catch (error) {
            logger.warn("Failed to extract task result", error);
            outputError = "Task completed but output is not available yet.";
          }
          const error =
            task.status === "failed"
              ? (getTaskErrorMessage(task.error) ?? "Task failed.")
              : output
                ? undefined
                : (outputError ??
                  "Task completed but no attemptCompletion output found.");

          return {
            output: output ?? "",
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

export const fileChangeEvent = new Emittery<{
  fileChanged: { filepath: string; content: string };
}>();

function mapTaskStatus(
  status:
    | "completed"
    | "pending-input"
    | "failed"
    | "pending-tool"
    | "pending-model",
): TaskOutputResult["status"] {
  switch (status) {
    case "pending-input":
      return "idle";
    case "pending-tool":
    case "pending-model":
      return "running";
    case "completed":
    case "failed":
      return "completed";
  }
}

function getTaskErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { message?: unknown };
  return typeof record.message === "string" ? record.message : undefined;
}
