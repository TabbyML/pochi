export type {
  VSCodeHostApi,
  WebviewHostApi,
} from "./webview";

export { createVscodeHostStub } from "./webview-stub";
export type { PochiCredentials } from "./types/pochi";

export type { McpStatus } from "../mcp-utils";
export type {
  FileDiff,
  ExecuteCommandResult,
  SaveCheckpointOptions,
} from "./types/execution";
export type { ResourceURI } from "./types/common";
export type { SessionState, WorkspaceState } from "./types/session";
export type {
  PochiTaskInfo,
  PochiTaskParams,
  TaskData,
  TaskChangedFile,
  ChangedFileContent,
  TaskState,
  TaskStates,
} from "./types/task";
export type {
  VSCodeLmModel,
  VSCodeLmRequestCallback,
  VSCodeLmRequestOptions,
  VSCodeLmRequest,
} from "./types/models";
export type { DisplayModel } from "./types/model";
export type { RuleFile } from "./types/rules";
export type { CaptureEvent } from "./types/capture-event";
export type {
  CustomAgentFile,
  InvalidCustomAgentFile,
  ValidCustomAgentFile,
} from "./types/custom-agent";
export { GitWorktreeInfo } from "./types/git";
export type {
  GitWorktree,
  GithubIssue,
  DiffCheckpointOptions,
  CreateWorktreeOptions,
} from "./types/git";
export { isValidCustomAgentFile } from "./types/custom-agent";
export {
  prefixTaskDisplayId,
  prefixWorktreeName,
  getTaskDisplayTitle,
  WorktreePrefix,
} from "./task-utils";

const isPochiDev = process.env.POCHI_LOCAL_SERVER === "true";
const isSyncDev = process.env.POCHI_LOCAL_SYNC_SERVER === "true";
export const isDev = isPochiDev || isSyncDev;

export function getServerBaseUrl() {
  return isPochiDev ? "http://localhost:4113" : "https://app.getpochi.com";
}

export function getSyncBaseUrl() {
  return isSyncDev
    ? "http://localhost:8787"
    : "https://livekit-cf.tabbyml.workers.dev";
}
