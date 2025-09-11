export type {
  VSCodeHostApi,
  WebviewHostApi,
} from "./webview";

export { createVscodeHostStub } from "./webview-stub";
export type { PochiCredentials } from "./types/pochi";

export type {
  McpStatus,
  McpConnection,
  McpToolStatus,
} from "./types/mcp";
export type {
  UserEditsDiff,
  ExecuteCommandResult,
  SaveCheckpointOptions,
} from "./types/execution";
export type { ResourceURI } from "./types/common";
export type { SessionState, WorkspaceState } from "./types/session";
export type { TaskIdParams, NewTaskParams } from "./types/task-params";
export type {
  VSCodeLmModel,
  VSCodeLmRequestOptions,
  VSCodeLmRequest,
} from "./types/models";
export type { DisplayModel } from "./types/model";
export type { RuleFile } from "./types/rules";
export type { CaptureEvent } from "./types/capture-event";
export type { CustomAgentFile } from "./types/custom-agent";

export const isDev = process.env.POCHI_LOCAL_SERVER === "true";
export const isSyncDev = process.env.POCHI_LOCAL_SYNC_SERVER === "true";

export function getServerBaseUrl() {
  return isDev ? "http://localhost:4113" : "https://app.getpochi.com";
}

export function getSyncBaseUrl() {
  return isSyncDev
    ? "ws://localhost:8787"
    : "wss://livekit-cf.tabbyml.workers.dev";
}
