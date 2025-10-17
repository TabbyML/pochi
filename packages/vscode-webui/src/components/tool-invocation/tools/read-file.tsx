import { useTranslation } from "react-i18next";
import { FileBadge } from "../file-badge";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const readFileTool: React.FC<ToolProps<"readFile">> = ({
  tool,
  isExecuting,
}) => {
  const { path, startLine, endLine } = tool.input || {};
  const { t } = useTranslation();
  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {t("toolInvocation.reading")}
      {path && (
        <FileBadge
          className="ml-1"
          path={path}
          startLine={startLine}
          endLine={endLine}
        />
      )}
    </>
  );
  return <ExpandableToolContainer title={title} />;
};
