import type { Message, UITools } from "@getpochi/livekit";
import type { ToolName } from "@getpochi/tools";
import type { ToolUIPart } from "ai";
import type { ToolCallCheckpoint } from "../message/message-list";

export interface ToolProps<T extends ToolName> {
  tool: Extract<ToolUIPart<UITools>, { type: `tool-${T}` }>;
  isExecuting: boolean;
  isLoading: boolean;
  messages: Message[];
  changes?: ToolCallCheckpoint;
}
