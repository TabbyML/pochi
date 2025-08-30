import type { Message, UITools } from "@getpochi/livekit";
import type { ToolUIPart } from "ai";
import type { ToolCallCheckpoint } from "../message/message-list";

export interface ToolProps<T extends string> {
  tool: Extract<ToolUIPart<UITools>, { type: `tool-${T}` }>;
  isExecuting: boolean;
  isLoading: boolean;
  messages: Message[];
  changes?: ToolCallCheckpoint;
}
