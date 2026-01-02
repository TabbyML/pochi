import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

export const todoWriteTool: React.FC<ToolProps<"todoWrite">> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();
  const todos = useMemo(() => {
    if (tool.state === "input-available" || tool.state === "output-available") {
      return tool.input.todos.filter((x) => x.status !== "cancelled");
    }

    return [];
  }, [tool]);

  // Check if all todos are completed
  const allCompleted = todos.length > 0 && todos.every((t) => t.status === "completed");

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting && !allCompleted} tool={tool} />
      <span className="ml-2" />
      {t("toolInvocation.updatingToDos")}
    </>
  );

  const expandableDetail = todos.length ? (
    <div className="flex flex-col px-2 py-1">
      {todos.map((todo) => (
        <span
          key={todo.id}
          className={cn("text-sm", {
            "line-through": todo.status === "completed",
          })}
        >
          • {todo.content}
        </span>
      ))}
    </div>
  ) : undefined;

  return (
    <ExpandableToolContainer
      title={title}
      expandableDetail={expandableDetail}
    />
  );
};