import type { ToolCallCheckpoint } from "@/components/message/message-list";
import type { Message, UITools } from "@getpochi/livekit";
import type { ToolUIPart } from "ai";

export type UIToolName = keyof UITools;
export type UIToolPart<T extends UIToolName = UIToolName> = ToolUIPart<
  Pick<UITools, T>
>;

export interface ToolProps<T extends UIToolName> {
  tool: UIToolPart<T>;
  isExecuting: boolean;
  isLoading: boolean;
  messages: Message[];
  changes?: ToolCallCheckpoint;
  isSubTask?: boolean;
  isLastPart?: boolean;
}
