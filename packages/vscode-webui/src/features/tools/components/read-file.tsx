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
  const builtInReadingLabel =
    builtInFile?.assetKind === "skills"
      ? t("toolInvocation.readingBuiltInSkill")
      : builtInFile?.assetKind === "agents"
        ? t("toolInvocation.readingBuiltInAgent")
        : t("toolInvocation.reading");
  const builtInFilePath = builtInFile?.filePath || builtInFile?.relativePath;

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {builtInFile && path ? (
        <>
          {builtInReadingLabel}{" "}
          <span className="font-medium text-foreground">
            {builtInFile.name}
          </span>{" "}
          <FileBadge
            className="ml-1"
            label={builtInFilePath}
            path={path}
            startLine={startLine}
            endLine={endLine}
          />
        </>
      ) : (
        <>
          {builtInReadingLabel}
          {path && (
            <FileBadge
              className="ml-1"
              path={path}
              startLine={startLine}
              endLine={endLine}
            />
          )}
        </>
      )}
    </>
  );
  return <ExpandableToolContainer title={title} />;
};
