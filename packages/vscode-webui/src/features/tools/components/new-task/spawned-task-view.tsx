import { TaskReferenceBadge } from "@/components/message/task-reference-badge";
import { Badge } from "@/components/ui/badge";
import { isVSCodeEnvironment } from "@/lib/vscode";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

/**
 * A newTask call that spawned an independent top-level task. The task runs in
 * its own tab and store, so the card only links to it.
 */
export function SpawnedTaskView({
  tool,
  isExecuting,
}: Pick<ToolProps<"newTask">, "tool" | "isExecuting">) {
  const uid = tool.input?._meta?.uid;
  const description = tool.input?.description ?? "";
  const prompt = tool.input?.prompt ?? "";
  const toolTitle = tool.input?.agentType?.trim() || "Task";
  const started =
    tool.state === "output-available" &&
    "result" in tool.output &&
    !("error" in tool.output);

  const title = (
    <div className="flex min-w-0 items-start gap-2">
      <StatusIcon
        tool={tool}
        isExecuting={isExecuting}
        className="flex h-5 shrink-0 items-center self-start leading-none"
      />
      <div className="min-w-0 flex-1 break-words text-muted-foreground leading-5">
        <Badge
          variant="secondary"
          className="mr-2 inline-flex h-5 shrink-0 py-0 align-top"
        >
          {toolTitle}
        </Badge>
        {started && uid && isVSCodeEnvironment() ? (
          <span data-testid="spawned-task-link">
            <TaskReferenceBadge id={uid} title={description} />
          </span>
        ) : (
          description && (
            <span className="break-words align-top">{description}</span>
          )
        )}
      </div>
    </div>
  );

  return (
    <ExpandableToolContainer
      title={title}
      expandIconClassName="mt-0"
      expandableDetail={
        prompt ? (
          <div className="whitespace-pre-wrap break-words rounded-md border p-2 text-muted-foreground text-sm">
            {prompt}
          </div>
        ) : undefined
      }
    />
  );
}
