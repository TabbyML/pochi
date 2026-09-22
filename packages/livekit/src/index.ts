import type { RequestData } from "./types";

export { defaultCatalog as catalog } from "./livestore";
export {
  LiveChatKit,
  type LiveChatKitBackgroundJobNotificationOptions,
  type LiveChatKitOptions,
  type LiveChatKitProjectMemoryOptions,
  type LiveChatKitTaskMemoryOptions,
} from "./chat/live-chat-kit";
export { getAutoCompactThreshold } from "./chat/auto-compact-policy";
export {
  type BackgroundJobNotificationPart,
  getBackgroundJobNotificationIds,
  getBackgroundJobNotificationParts,
} from "./chat/background-job-notification";
export type { AutoMemoryManager } from "@getpochi/common";
export type { RunningTaskAdaptor } from "./background-task/task-executor/task-executor";
export type LLMRequestData = RequestData["llm"];
export type {
  Message,
  Task,
  UITools,
  DataParts,
  LiveKitStore,
  File,
} from "./types";
export type { BlobStore } from "./blob-store";

export { processContentOutput, fileToUri, findBlob } from "./store-blob";
export {
  createBackgroundSubagentNotification,
  extractAttemptCompletionResult,
  extractTaskResult,
  formatFollowupQuestions,
  getTaskErrorMessage,
  isAwaitingFollowupAnswer,
  isResultMessage,
  mapTaskStatusToBackgroundStatus,
} from "./task-utils";
export type {
  BackgroundJobStatus,
  TaskStatusLike,
} from "./task-utils";
export { toTaskStatus } from "./task";

export {
  BackgroundJobManager,
  type BackgroundCommandAdaptor,
  type BackgroundJobManagerOptions,
  type BackgroundTaskStateStore,
} from "./background-job/manager";
export type {
  BackgroundJobEntry,
  JobStatus,
} from "./background-job/state";
