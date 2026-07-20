import { MessageMarkdown } from "@/components/message";
import { TaskThread } from "@/components/task-thread";
import { FixedStateChatContextProvider } from "@/features/chat";
import {
  getAttemptTodoCompletionSummary,
  parseAttemptTodoCompletionResult,
} from "@/lib/todos-utils";
import {
  getToolPartError,
  isToolCallCancellationError,
} from "@/lib/tool-call-error";
import { cn } from "@/lib/utils";
import { isTodoListResolved } from "@getpochi/tools";
import { useTranslation } from "react-i18next";
import type { NewTaskToolViewProps } from ".";
import { CreatePrAction } from "../create-pr-action";
import { SubAgentView } from "./sub-agent-view";

interface AttemptTodoCompletionViewProps extends NewTaskToolViewProps {
  taskSource: NewTaskToolViewProps["taskSource"];
}

export function AttemptTodoCompletionView({
  uid,
  tool,
  isExecuting,
  taskSource,
  toolCallStatusRegistryRef,
  isSubTask,
  isLastPart,
}: AttemptTodoCompletionViewProps) {
  const { t } = useTranslation();
  const result =
    tool.state === "output-available" && "result" in tool.output
      ? tool.output.result
      : undefined;
  const summary = getAttemptTodoCompletionSummary(result);
  const parsedResult = parseAttemptTodoCompletionResult(result);
  const resolved = parsedResult
    ? isTodoListResolved(parsedResult.todos)
    : undefined;
  const auditError = getToolPartError(tool);
  const wasStopped = isToolCallCancellationError(auditError);
  const hasAuditFailure = !wasStopped && !!auditError;
  let title = t("attemptTodoCompletionView.auditing");

  if (wasStopped) {
    title = t("attemptTodoCompletionView.stopped");
  } else if (hasAuditFailure) {
    title = t("attemptTodoCompletionView.unavailable");
  } else if (resolved) {
    title = t("attemptTodoCompletionView.completed");
  } else if (resolved === false && !isExecuting) {
    title = t("attemptTodoCompletionView.needsWork");
  }

  const hasTaskThread = !!taskSource && taskSource.messages.length > 1;
  const showSummary = !!summary && !auditError;
  const showInlineTaskThread = !showSummary && hasTaskThread;
  const showFooterTaskThread = showSummary && hasTaskThread;
  const isAuditInProgress =
    isExecuting && !wasStopped && !hasAuditFailure && resolved !== true;

  return (
    <SubAgentView
      uid={uid}
      tool={tool}
      isExecuting={isExecuting}
      taskSource={taskSource}
      toolCallStatusRegistryRef={toolCallStatusRegistryRef}
      assistantName="Todo"
      showToolCall={false}
      showTaskThread={showFooterTaskThread}
      headerActions={
        resolved && !isExecuting && !isSubTask && isLastPart ? (
          <CreatePrAction />
        ) : undefined
      }
      headerContent={
        <span
          className={cn(
            "break-words align-middle font-medium text-foreground group-hover:underline",
            isAuditInProgress && "animated-gradient-text",
          )}
        >
          {title}
        </span>
      }
    >
      {showSummary ? (
        <div className="px-3 py-2 text-muted-foreground leading-6">
          <MessageMarkdown>{summary}</MessageMarkdown>
        </div>
      ) : showInlineTaskThread ? (
        <FixedStateChatContextProvider
          toolCallStatusRegistry={toolCallStatusRegistryRef?.current}
        >
          <TaskThread
            source={{ ...taskSource, isLoading: false }}
            showMessageList={true}
            scrollAreaClassName="my-0 max-h-[180px] border-none"
            assistant={{ name: "Todo" }}
          />
        </FixedStateChatContextProvider>
      ) : auditError ? (
        <div className="px-4 py-3 text-muted-foreground leading-6">
          {auditError}
        </div>
      ) : null}
    </SubAgentView>
  );
}
