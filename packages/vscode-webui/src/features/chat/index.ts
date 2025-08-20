// Export the main context and provider
export {
  ChatContextProvider,
  FixedStateChatContextProvider,
  ToolCallStatusRegistry,
  useAutoApproveGuard,
  useToolCallLifeCycle,
} from "./lib/chat-state";

export { useSendMessage, useHandleChatEvents } from "./lib/chat-events";
export { useLiveChatKitGetters } from "./lib/use-live-chat-kit-getters";

// Export new tool call state management hooks
export type { ToolCallLifeCycle } from "./lib/tool-call-life-cycle";

export { ChatPage } from "./page";
