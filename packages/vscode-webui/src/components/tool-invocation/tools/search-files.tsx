import type React from "react";
import { FileList } from "../file-list";
import { HighlightedText } from "../highlight-text";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";
import { useTranslation } from "react-i18next";

export const searchFilesTool: React.FC<ToolProps<"searchFiles">> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();
  const { path, regex, filePattern } = tool.input || {};

  let resultEl: React.ReactNode;
  let matches: { file: string; line: number; context: string }[] = [];
  let isTruncated = false;
  if (tool.state === "output-available" && !("error" in tool.output)) {
    matches = tool.output.matches ?? [];
    isTruncated = tool.output.isTruncated ?? false;
    resultEl =
      matches.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <FileList matches={matches} />
        </div>
      ) : null;
  }

  const searchCondition = (
    <>
      <HighlightedText>{regex}</HighlightedText> {t('toolInvocation.in')}{" "}
      <HighlightedText>{path}</HighlightedText>
      {filePattern && <HighlightedText>{filePattern}</HighlightedText>}
    </>
  );

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {isExecuting || tool.state !== "output-available" ? (
        <span>{t('toolInvocation.searchingFor')} {searchCondition}</span>
      ) : (
        <span>
          {t('toolInvocation.searchingFor')} {searchCondition}, {matches.length} {t('toolInvocation.matched')}
          {isTruncated && t('toolInvocation.resultsTruncated')}
        </span>
      )}
    </>
  );

  return <ExpandableToolContainer title={title} expandableDetail={resultEl} />;
};
