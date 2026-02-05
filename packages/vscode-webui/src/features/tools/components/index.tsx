import type { ToolCallCheckpoint } from "@/components/message/message-list";
import { useToolCallLifeCycle } from "@/features/chat";
import { cn } from "@/lib/utils";
import type { Message, UITools } from "@getpochi/livekit";
import { type ToolUIPart, getToolName } from "ai";
import { applyDiffTool } from "./apply-diff";
import { AskFollowupQuestionTool } from "./ask-followup-question";
import { AttemptCompletionTool } from "./attempt-completion";
import { createReviewTool } from "./create-review";
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
import { UseSkillTool } from "./use-skill";
import { writeToFileTool } from "./write-to-file";

export function ToolInvocationPart({
  tool,
  isLoading,
  className,
  messages,
  changes,
  isSubTask,
}: {
  tool: ToolUIPart<UITools>;
  isLoading: boolean;
  messages: Message[];
  className?: string;
  changes?: ToolCallCheckpoint;
  isSubTask?: boolean;
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
          isSubTask={isSubTask}
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
  todoWrite: todoWriteTool,
  createReview: createReviewTool,
  editNotebook: editNotebookTool,
  useSkill: UseSkillTool,
  // @ts-expect-error
  newTask: newTaskTool,
};
