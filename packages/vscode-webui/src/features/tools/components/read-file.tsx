import { getToolPartError } from "@/lib/tool-call-error";
import { parseBackgroundJobOutputFilePath } from "@getpochi/common/pochi-file-system";
import { useTranslation } from "react-i18next";
import { BackgroundJobPanel } from "./command-execution-panel";
import { FileBadge } from "./file-badge";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

export const readFileTool: React.FC<ToolProps<"readFile">> = ({
  tool,
  isExecuting,
}) => {
  const { path, startLine, endLine, offset, limit } = tool.input || {};
  const displayStartLine = offset ?? (limit !== undefined ? 1 : startLine);
  const displayEndLine =
    limit !== undefined && displayStartLine !== undefined
      ? displayStartLine + limit - 1
      : endLine;
  const { t } = useTranslation();
  const backgroundJobOutput = path
    ? parseBackgroundJobOutputFilePath(path)
    : undefined;

  if (backgroundJobOutput) {
    const hasError = getToolPartError(tool) !== undefined;
    const finalJobId =
      tool.state !== "input-streaming" && !hasError
        ? backgroundJobOutput.backgroundJobId
        : undefined;
    const output =
      tool.state === "output-available" && tool.output.type !== "media"
        ? tool.output.content
        : undefined;
    const title = (
      <>
        <StatusIcon isExecuting={isExecuting} tool={tool} />
        <span className="ml-2">
          {backgroundJobOutput.kind === "terminal"
            ? t("toolInvocation.readTerminal")
            : t("toolInvocation.readBackground")}
        </span>
      </>
    );

    return (
      <ExpandableToolContainer
        title={title}
        detail={
          finalJobId ? (
            <BackgroundJobPanel backgroundJobId={finalJobId} output={output} />
          ) : null
        }
      />
    );
  }

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {t("toolInvocation.reading")}
      {path && (
        <FileBadge
          className="ml-1"
          path={path}
          startLine={displayStartLine}
          endLine={displayEndLine}
        />
      )}
    </>
  );
  return <ExpandableToolContainer title={title} />;
};
