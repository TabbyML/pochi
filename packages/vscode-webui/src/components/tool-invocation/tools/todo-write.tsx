import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { filter, isNonNullish } from "remeda";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const todoWriteTool: React.FC<ToolProps<"todoWrite">> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();
  const todos = filter(tool.input?.todos ?? [], isNonNullish);

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
