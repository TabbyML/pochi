import { MessageMarkdown } from "@/components/message";
import { useTranslation } from "react-i18next";
import { StatusIcon } from "./status-icon";
import type { ToolProps } from "./types";

export const CompleteTodoTool: React.FC<ToolProps<"completeTodo">> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();

  const summary =
    tool.state === "output-available" ? (tool.output.summary ?? "") : "";

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-2 font-bold text-sm">
        <StatusIcon tool={tool} isExecuting={isExecuting} />
        {t("toolInvocation.auditingTodo")}
      </span>
      {summary && <MessageMarkdown>{summary}</MessageMarkdown>}
    </div>
  );
};
