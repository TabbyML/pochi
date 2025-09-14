import { Bug } from "lucide-react";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";
import { useTranslation } from "react-i18next";

export const todoWriteTool: React.FC<ToolProps<"todoWrite">> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();
  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {t('toolInvocation.updatingToDos')}
      <Bug className="ml-2 inline size-3" />
    </>
  );

  return <ExpandableToolContainer title={title} />;
};
