// Export the main context and provider
export {
  ChatContextProvider,
  FixedStateChatContextProvider,
  ToolCallStatusRegistry,
  useAutoApproveGuard,
  useToolCallLifeCycle,
  useRetryCount,
} from "./lib/chat-state";

export { useSendMessage, useHandleChatEvents } from "./lib/chat-events";
export { useLiveChatKitGetters } from "./lib/use-live-chat-kit-getters";
export {
  useBackgroundJobInfo,
  useReplaceJobIdsInContent,
  BackgroundJobContextProvider,
} from "./lib/use-background-job-display";

// Export new tool call state management hooks
export type { ToolCallLifeCycle } from "./lib/tool-call-life-cycle";

export { ChatPage, ChatSkeleton } from "./page";

export { CreateTaskInput } from "./components/create-task-input";

export {
  useRepairMermaid,
  type RepairMermaidOptions,
} from "./hooks/use-repair-mermaid";

export { useChatUiStore } from "./store";
