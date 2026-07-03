import { MessageMarkdown } from "@/components/message";
import { TaskThread } from "@/components/task-thread";
import { FixedStateChatContextProvider } from "@/features/chat";
import { getToolPartError } from "@/lib/tool-call-error";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { NewTaskToolViewProps } from ".";
import {
  getAttemptTodoCompletionSummary,
  isAttemptTodoCompletionResolved,
} from "./result";
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
}: AttemptTodoCompletionViewProps) {
  const { t } = useTranslation();
  const result =
    tool.state === "output-available" && "result" in tool.output
      ? tool.output.result
      : undefined;
  const summary = getAttemptTodoCompletionSummary(result);
  const resolved = isAttemptTodoCompletionResolved(result);
  const hasAuditFailure =
    !!getToolPartError(tool) ||
    (tool.state === "output-available" && resolved === undefined);
  const showTaskThread =
    isExecuting && !summary && !!taskSource && taskSource.messages.length > 1;
  const showFooterTaskThread = !isExecuting;

  let title = t("attemptTodoCompletionView.auditing");

  if (resolved) {
    title = t("attemptTodoCompletionView.completed");
  } else if (resolved === false && !isExecuting) {
    title = t("attemptTodoCompletionView.needsWork");
  } else if (hasAuditFailure) {
    title = t("attemptTodoCompletionView.failed");
  }

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
    >
      {summary ? (
        <div className="px-3 py-2 text-muted-foreground leading-6">
          <MessageMarkdown>{summary}</MessageMarkdown>
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
