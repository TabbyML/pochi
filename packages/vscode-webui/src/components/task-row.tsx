import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { parseTitle } from "@getpochi/common/message-utils";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import type { Message, Task, UITools } from "@getpochi/livekit";
import { type ToolUIPart, getToolName } from "ai";
import {
  CheckCircle2,
  Edit3,
  GitBranch,
  HelpCircle,
  ListTreeIcon,
} from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MdOutlineErrorOutline } from "react-icons/md";
import { McpToolCallSummary } from "./tool-invocation/mcp-tool-call";
import { applyDiffToolSummary } from "./tool-invocation/tools/apply-diff";
import { AskFollowupQuestionTool } from "./tool-invocation/tools/ask-followup-question";
import { AttemptCompletionTool } from "./tool-invocation/tools/attempt-completion";
import { editNotebookToolSummary } from "./tool-invocation/tools/edit-notebook";
import { executeCommandToolSummary } from "./tool-invocation/tools/execute-command";
import { globFilesToolSummary } from "./tool-invocation/tools/glob-files";
import { KillBackgroundJobToolSummary } from "./tool-invocation/tools/kill-background-job";
import { listFilesToolSummary } from "./tool-invocation/tools/list-files";
import { multiApplyDiffToolSummary } from "./tool-invocation/tools/multi-apply-diff";
import { newTaskToolSummary } from "./tool-invocation/tools/new-task";
import { ReadBackgroundJobOutputToolSummary } from "./tool-invocation/tools/read-background-job-output";
import { readFileToolSummary } from "./tool-invocation/tools/read-file";
import { searchFilesToolSummary } from "./tool-invocation/tools/search-files";
import { StartBackgroundJobToolSummary } from "./tool-invocation/tools/start-background-job";
import { todoWriteToolSummary } from "./tool-invocation/tools/todo-write";
import { writeToFileToolSummary } from "./tool-invocation/tools/write-to-file";
import type { ToolProps } from "./tool-invocation/types";

export function TaskRow({
  task,
  worktreeName,
  isWorktreeExist,
}: {
  task: Task;
  worktreeName?: string;
  isWorktreeExist?: boolean;
}) {
  const { jwt } = usePochiCredentials();

  const title = useMemo(() => parseTitle(task.title), [task.title]);

  const content = (
    <div
      className={cn(
        "group cursor-pointer rounded-lg border border-border/50 bg-card transition-all duration-200 hover:border-border hover:bg-card/90 hover:shadow-md",
        "border-l-4",
        getStatusBorderColor(task.status),
      )}
    >
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-1 overflow-hidden">
            <GitBadge
              git={task.git}
              worktreeName={worktreeName}
              className="max-w-full text-muted-foreground/80 text-xs"
              isWorktreeExist={isWorktreeExist}
            />
            <h3 className="line-clamp-2 flex-1 font-medium text-foreground leading-relaxed transition-colors duration-200 group-hover:text-foreground/80">
              {title}
            </h3>
            <div className="text-muted-foreground">
              {!!task.pendingToolCalls?.length && (
                <PendingToolCallView
                  // @ts-expect-error
                  tools={task.pendingToolCalls}
                  isExecuting
                />
              )}
            </div>
          </div>
          <div className="mt-0.5 shrink-0">
            <TaskStatusIcon status={task.status} />
          </div>
        </div>
      </div>
    </div>
  );

  const storeId = encodeStoreId(jwt, task.parentId || task.id);

  const openTaskInPanel = useCallback(() => {
    if (task.cwd) {
      vscodeHost.openTaskInPanel({
        cwd: task.cwd,
        uid: task.id,
        storeId,
      });
    }
  }, [task.cwd, task.id, storeId]);

  return <div onClick={openTaskInPanel}>{content}</div>;
}

const TaskStatusIcon = ({ status }: { status: string }) => {
  const { t } = useTranslation();
  const iconProps = { className: "size-5 text-muted-foreground" };
  switch (status) {
    case "streaming":
    case "pending-tool":
    case "pending-input":
    case "pending-model":
      return (
        <Edit3 {...iconProps} aria-label={t("tasksPage.status.pendingInput")} />
      );
    case "completed":
      return (
        <CheckCircle2
          {...iconProps}
          aria-label={t("tasksPage.status.completed")}
        />
      );
    case "failed":
      return (
        <MdOutlineErrorOutline
          {...iconProps}
          aria-label={t("tasksPage.status.failed")}
        />
      );
    default:
      return (
        <HelpCircle
          {...iconProps}
          aria-label={t("tasksPage.status.unknown", { status })}
        />
      );
  }
};

const getStatusBorderColor = (status: string): string => {
  switch (status) {
    case "streaming":
    case "pending-tool":
    case "pending-input":
      return "border-l-muted-foreground/60";
    case "completed":
      return "border-l-muted-foreground/30";
    case "failed":
      return "border-l-muted-foreground/80";
    default:
      return "border-l-muted-foreground/50";
  }
};

const emptyMessages: Message[] = [];
function PendingToolCallView({
  tools,
  isExecuting,
}: {
  tools: ToolUIPart<UITools>[];
  isExecuting: boolean;
}) {
  const tool = tools[0];
  const toolName = getToolName(tool);
  const C = Tools[toolName];

  return (
    <div className={cn("flex items-center gap-1 text-muted-foreground")}>
      {C ? (
        <C
          tool={tool}
          isLoading={false}
          isExecuting={isExecuting}
          messages={emptyMessages}
        />
      ) : (
        <McpToolCallSummary
          messages={emptyMessages}
          tool={tool}
          isLoading={false}
          isExecuting={isExecuting}
        />
      )}
      {/* {tools.length > 1 && <span>More</span>} */}
    </div>
  );
}

function GitBadge({
  className,
  git,
  worktreeName,
  isWorktreeExist,
}: {
  git: Task["git"];
  worktreeName?: string;
  className?: string;
  isWorktreeExist?: boolean;
}) {
  const { t } = useTranslation();
  if (!git?.origin) return null;

  return (
    <Badge
      variant="outline"
      className={cn("border-none p-0 text-foreground", className)}
    >
      {git.branch &&
        !isBranchNameSameAsWorktreeName(git.branch, worktreeName) && (
          <>
            <GitBranch className="shrink-0" />
            <span className="truncate">{git.branch}</span>
          </>
        )}
      {worktreeName && (
        <>
          <ListTreeIcon className="ml-1 shrink-0" />
          <span className="truncate">{worktreeName}</span>
          {isWorktreeExist === false && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="ml-1 inline-flex">
                  <MdOutlineErrorOutline className="size-4 text-yellow-500" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                <span>{t("tasksPage.worktreeNotExist")}</span>
              </TooltipContent>
            </Tooltip>
          )}
        </>
      )}
    </Badge>
  );
}

function isBranchNameSameAsWorktreeName(
  branch: string | undefined,
  worktreeName: string | undefined,
): boolean {
  if (!branch || !worktreeName) return false;
  // https://github.com/microsoft/vscode/blob/9092ce3427fdd0f677333394fb10156616090fb5/extensions/git/src/commands.ts#L3512
  return branch.replace(/\//g, "-") === worktreeName;
}

// biome-ignore lint/suspicious/noExplicitAny: matching all tools
const Tools: Record<string, React.FC<ToolProps<any>>> = {
  attemptCompletion: AttemptCompletionTool,
  readFile: readFileToolSummary,
  writeToFile: writeToFileToolSummary,
  applyDiff: applyDiffToolSummary,
  multiApplyDiff: multiApplyDiffToolSummary,
  askFollowupQuestion: AskFollowupQuestionTool,
  executeCommand: executeCommandToolSummary,
  startBackgroundJob: StartBackgroundJobToolSummary,
  readBackgroundJobOutput: ReadBackgroundJobOutputToolSummary,
  killBackgroundJob: KillBackgroundJobToolSummary,
  searchFiles: searchFilesToolSummary,
  listFiles: listFilesToolSummary,
  globFiles: globFilesToolSummary,
  todoWrite: todoWriteToolSummary,
  editNotebook: editNotebookToolSummary,
  // @ts-ignore
  newTask: newTaskToolSummary,
};
