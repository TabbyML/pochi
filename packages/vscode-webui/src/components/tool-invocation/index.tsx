import { useToolCallLifeCycle } from "@/features/chat";
import { useIsDevMode } from "@/features/settings";
import { cn } from "@/lib/utils";
import type { Message, UITools } from "@getpochi/livekit";
import { type ToolUIPart, getToolName } from "ai";
import type { ToolCallCheckpoint } from "../message/message-list";
import { McpToolCall } from "./mcp-tool-call";
import { applyDiffTool } from "./tools/apply-diff";
import { AskFollowupQuestionTool } from "./tools/ask-followup-question";
import { AttemptCompletionTool } from "./tools/attempt-completion";
import { executeCommandTool } from "./tools/execute-command";
import { globFilesTool } from "./tools/glob-files";
import { KillBackgroundJobTool } from "./tools/kill-background-job";
import { listFilesTool } from "./tools/list-files";
import { multiApplyDiffTool } from "./tools/multi-apply-diff";
import { newTaskTool } from "./tools/new-task";
import { ReadBackgroundJobOutputTool } from "./tools/read-background-job-output";
import { readFileTool } from "./tools/read-file";
import { searchFilesTool } from "./tools/search-files";
import { StartBackgroundJobTool } from "./tools/start-background-job";
import { todoWriteTool } from "./tools/todo-write";
import { webFetchTool } from "./tools/web-fetch";
import { writeToFileTool } from "./tools/write-to-file";
import type { ToolProps } from "./types";

export function ToolInvocationPart({
  tool,
  isLoading,
  className,
  messages,
  changes,
}: {
  tool: ToolUIPart<UITools>;
  isLoading: boolean;
  messages: Message[];
  className?: string;
  changes?: ToolCallCheckpoint;
}) {
  const toolName = getToolName(tool);
  const lifecycle = useToolCallLifeCycle().getToolCallLifeCycle({
    toolName,
    toolCallId: tool.toolCallId,
  });
  const isExecuting = lifecycle.status.startsWith("execute");
  const C = Tools[toolName];
  const [isDevMode] = useIsDevMode();
  if (toolName === "todoWrite" && !isDevMode) {
    return null; // Skip rendering the todoWrite tool in non-dev mode
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {C ? (
        <C
          tool={tool}
          isExecuting={isExecuting}
          isLoading={isLoading}
          changes={changes}
          messages={messages}
        />
      ) : (
        <McpToolCall
          tool={tool}
          isLoading={isLoading}
          isExecuting={isExecuting}
          messages={messages}
        />
      )}
    </div>
  );
}

// biome-ignore lint/suspicious/noExplicitAny: matching all tools
const Tools: Record<string, React.FC<ToolProps<any>>> = {
  attemptCompletion: AttemptCompletionTool,
  readFile: readFileTool,
  writeToFile: writeToFileTool,
  applyDiff: applyDiffTool,
  multiApplyDiff: multiApplyDiffTool,
  askFollowupQuestion: AskFollowupQuestionTool,
  executeCommand: executeCommandTool,
  startBackgroundJob: StartBackgroundJobTool,
  readBackgroundJobOutput: ReadBackgroundJobOutputTool,
  killBackgroundJob: KillBackgroundJobTool,
  searchFiles: searchFilesTool,
  listFiles: listFilesTool,
  globFiles: globFilesTool,
  webFetch: webFetchTool,
  todoWrite: todoWriteTool,
  // @ts-ignore
  newTask: newTaskTool,
  // @ts-ignore
  newCustomAgent: newTaskTool,
};
