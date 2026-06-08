import { getPochiBuiltinFileDisplayInfo } from "@getpochi/common";
import { useTranslation } from "react-i18next";
import { FileBadge } from "./file-badge";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

export const readFileTool: React.FC<ToolProps<"readFile">> = ({
  tool,
  isExecuting,
}) => {
  const { path, startLine, endLine } = tool.input || {};
  const { t } = useTranslation();
  const builtInFile = path ? getPochiBuiltinFileDisplayInfo(path) : undefined;
  const builtInReference = builtInFile?.isReference ? builtInFile : undefined;
  const readingLabel =
    builtInReference?.assetKind === "skills"
      ? t("toolInvocation.readingBuiltInSkillReference")
      : builtInReference?.assetKind === "agents"
        ? t("toolInvocation.readingBuiltInAgentReference")
        : t("toolInvocation.reading");

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {readingLabel}
      {path && (
        <FileBadge
          className="ml-1"
          label={builtInReference?.relativePath}
          path={path}
          startLine={startLine}
          endLine={endLine}
        />
      )}
    </>
  );
  return <ExpandableToolContainer title={title} />;
};
