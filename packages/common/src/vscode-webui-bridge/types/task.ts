import type { Todo } from "@getpochi/tools";
import type {
  ActiveSelection,
  PastedTextFile,
  TerminalTextSelection,
} from "../../base";
import type { ValidSkillFile } from "./skill";

export type FileUIPart = {
  name: string;
  contentType: string;
  url: string;
};

/**
 * Per-task MCP configuration override.
 * Key = server name, presence indicates server is enabled for this task.
 */
export type McpConfigOverride = {
  [serverName: string]: {
    disabledTools: readonly string[];
  };
};

export type PochiTaskParams = { cwd: string } & (
  | {
      type: "new-task";
      uid?: string;
      prompt?: string;
      pastedTextFiles?: PastedTextFile[];
      todos?: Todo[];
      files?: FileUIPart[];
      activeSelection?: ActiveSelection;
      invokedSkills?: ValidSkillFile[];
      invokedCustomAgents?: string[];
      terminalContextSelections?: TerminalTextSelection[];
      mcpConfigOverride?: McpConfigOverride;
    }
  | {
      type: "fork-task";
      uid: string;
      storeId: string;
      forkParams?: {
        sourceStoreId: string;
        sourceTaskId: string;
        messageId: string;
        title?: string;
      };
      mcpConfigOverride?: McpConfigOverride;
    }
  | {
      type: "compact-task";
      messages: string;
      modelId?: string;
    }
  | {
      type: "open-task";
      uid: string;
      storeId?: string;
    }
);

export type PochiTaskInfo = PochiTaskParams & {
  uid: string;
};

export interface TaskState {
  unread?: boolean;
  active?: boolean;
  running?: boolean;
  requiresApproval?: boolean;

  cwd: string;
  focused?: boolean;
}

export type TaskStates = Record<string, TaskState>;

/**
 * A user message queued while the agent is busy. Persisted per task so it
 * survives webview reloads; `parts` and `display` are opaque to the host.
 */
export type QueuedUserInputRecord = {
  id: string;
  parts: unknown[];
  display?: unknown;
};

export type TaskArchivedParams =
  | { type: "single"; taskId: string; archived: boolean }
  | { type: "batch" };

export type TaskPinnedParams = {
  taskId: string;
  pinned: boolean;
};
