import { createContext } from "react";
import type { ToolCallLifeCycle } from "../tool-call-life-cycle";

export interface ChatState {
  // Auto approve guard have three modes:
  // "auto": auto execute tool call run, and auto start next round (sendAutomaticWhen === true)
  // "manual": manual execute tool call run, and auto start next round (sendAutomaticWhen === true)
  // "stop": stop auto execute tool call run, and stop next round (sendAutomaticWhen === false)
  autoApproveGuard: React.RefObject<"auto" | "manual" | "stop">;
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
