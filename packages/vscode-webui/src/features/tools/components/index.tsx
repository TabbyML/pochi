import type { ToolCallCheckpoint } from "@/components/message/message-list";
import { useToolCallLifeCycle } from "@/features/chat";
import { cn } from "@/lib/utils";
import type { Message, UITools } from "@getpochi/livekit";
import { type ToolUIPart, getToolName } from "ai";
import { applyDiffTool } from "./apply-diff";
import { AskFollowupQuestionTool } from "./ask-followup-question";
import { AttemptCompletionTool } from "./attempt-completion";
import { editNotebookTool } from "./edit-notebook";
import { executeCommandTool } from "./execute-command";
import { globFilesTool } from "./glob-files";
import { KillBackgroundJobTool } from "./kill-background-job";
import { listFilesTool } from "./list-files";
import { McpToolCall } from "./mcp-tool-call";
import { multiApplyDiffTool } from "./multi-apply-diff";
import { newTaskTool } from "./new-task";
import { ReadBackgroundJobOutputTool } from "./read-background-job-output";
import { readFileTool } from "./read-file";
import { searchFilesTool } from "./search-files";
import { StartBackgroundJobTool } from "./start-background-job";
import { todoWriteTool } from "./todo-write";
import type { ToolProps } from "./types";
import { writeToFileTool } from "./write-to-file";

export function ToolInvocationPart({
  tool,
  isLoading,
  className,
  messages,
  changes,
  taskId,
}: {
  tool: ToolUIPart<UITools>;
  isLoading: boolean;
  messages: Message[];
  className?: string;
  changes?: ToolCallCheckpoint;
  taskId?: string;
}) {
  const toolName = getToolName(tool);
  const lifecycle = useToolCallLifeCycle().getToolCallLifeCycle({
    toolName,
    toolCallId: tool.toolCallId,
  });
  const isExecuting = lifecycle.status.startsWith("execute");
  const C = Tools[toolName];

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {C ? (
        <C
          tool={tool}
          isExecuting={isExecuting}
          isLoading={isLoading}
          changes={changes}
          messages={messages}
          taskId={taskId}
        />
      ) : (
        <McpToolCall
          tool={tool}
          isLoading={isLoading}
          isExecuting={isExecuting}
          messages={messages}
          taskId={taskId}
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
  todoWrite: todoWriteTool,
  editNotebook: editNotebookTool,
  // @ts-ignore
  newTask: newTaskTool,
};
