import type { ToolCallCheckpoint } from "@/components/message/message-list";
import type { Message, UITools } from "@getpochi/livekit";
import type { ToolName } from "@getpochi/tools";
import type { ToolUIPart } from "ai";

export interface ToolProps<T extends ToolName> {
  tool: Extract<ToolUIPart<UITools>, { type: `tool-${T}` }>;
  isExecuting: boolean;
  isLoading: boolean;
  messages: Message[];
  changes?: ToolCallCheckpoint;
  isSubTask?: boolean;
  isLastPart?: boolean;
}
