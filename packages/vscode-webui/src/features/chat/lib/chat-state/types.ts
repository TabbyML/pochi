import { createContext } from "react";
import type { ToolCallLifeCycle } from "../tool-call-life-cycle";

export interface ChatState {
  autoApproveGuard: React.RefObject<boolean>;
  abortController: React.RefObject<AbortController>;
  getToolCallLifeCycle: (key: ToolCallLifeCycleKey) => ToolCallLifeCycle;
  executingToolCalls: ToolCallLifeCycle[];
  previewingToolCalls?: ToolCallLifeCycle[];
  completeToolCalls: ToolCallLifeCycle[];
}

export interface ToolCallLifeCycleKey {
  toolName: string;
  toolCallId: string;
}

export const ChatContext = createContext<ChatState | undefined>(undefined);
