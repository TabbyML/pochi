import { MessageMarkdown } from "@/components/message";
import { TaskThread } from "@/components/task-thread";
import { FixedStateChatContextProvider } from "@/features/chat";
import {
  getAttemptTodoCompletionSummary,
  parseAttemptTodoCompletionResult,
} from "@/lib/todos-utils";
import {
  getToolPartError,
  isUserCancelledToolCallError,
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
  const wasStopped = isUserCancelledToolCallError(auditError);
  const hasAuditFailure =
    !wasStopped &&
    (!!auditError ||
      (tool.state === "output-available" && resolved === undefined));
  const showTaskThread =
    isExecuting && !summary && !!taskSource && taskSource.messages.length > 1;
  const showFooterTaskThread = !isExecuting;

  let title = t("attemptTodoCompletionView.auditing");

  if (resolved) {
    title = t("attemptTodoCompletionView.completed");
  } else if (resolved === false && !isExecuting) {
    title = t("attemptTodoCompletionView.needsWork");
  } else if (wasStopped) {
    title = t("attemptTodoCompletionView.stopped");
  } else if (hasAuditFailure) {
    title = t("attemptTodoCompletionView.failed");
  }

  const fallbackDescription = wasStopped
    ? t("attemptTodoCompletionView.stoppedDescription")
    : hasAuditFailure
      ? t("attemptTodoCompletionView.failedDescription")
      : undefined;

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
            isExecuting && "animated-gradient-text",
          )}
        >
          {title}
        </span>
      }
      footerTaskThreadLabel={t("attemptTodoCompletionView.auditDetails")}
      statusIconVariant={wasStopped ? "muted" : undefined}
    >
      {summary ? (
        <div className="px-3 py-2 text-muted-foreground leading-6">
          <MessageMarkdown>{summary}</MessageMarkdown>
        </div>
      ) : fallbackDescription && !showTaskThread ? (
        <div className="px-3 py-2 text-muted-foreground leading-6">
          {fallbackDescription}
        </div>
      ) : (
        showTaskThread && (
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
        )
      )}
    </SubAgentView>
  );
}
