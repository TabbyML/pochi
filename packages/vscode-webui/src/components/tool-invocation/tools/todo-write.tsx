import { TodoList } from "@/features/todo";
import type { Todo } from "@getpochi/tools";
import { useTranslation } from "react-i18next";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const todoWriteTool: React.FC<ToolProps<"todoWrite">> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();
  const todos = tool.input?.todos?.filter((x) => !!x?.id) ?? [];
  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {t("toolInvocation.updatingToDos")}
    </>
  );
  const expandableDetail = todos?.length ? (
    <TodoList todos={todos as Todo[]} disableCollapse className="mt-2">
      <TodoList.Items viewportClassname="max-h-48" />
    </TodoList>
  ) : null;

  return (
    <ExpandableToolContainer
      title={title}
      expandableDetail={expandableDetail}
    />
  );
};
