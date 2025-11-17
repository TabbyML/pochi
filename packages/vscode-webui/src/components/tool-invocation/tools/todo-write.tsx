import { cn } from "@/lib/utils";
import type { Todo } from "@getpochi/tools";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const todoWriteTool: React.FC<ToolProps<"todoWrite">> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();
  const todos = useMemo(() => {
    let value = tool.input?.todos;

    if (typeof value === "string") {
      try {
        value = JSON.parse(value) as Todo[];
      } catch (e) {
        value = [];
      }
    }

    if (Array.isArray(value)) {
      return value.filter((x) => {
        return !!x && "id" in x && "content" in x;
      }) as Todo[];
    }

    return [];
  }, [tool.input?.todos]);

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {t("toolInvocation.updatingToDos")}
    </>
  );

  const expandableDetail = (
    <div className="flex flex-col px-2 py-1">
      {todos
        .filter((x) => !!x?.status && x.status !== "cancelled")
        .map((todo) => (
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
  );

  return (
    <ExpandableToolContainer
      title={title}
      expandableDetail={expandableDetail}
    />
  );
};
