import { useTranslation } from "react-i18next";
import { FileList } from "../file-list";
import { HighlightedText } from "../highlight-text";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const globFilesTool: React.FC<ToolProps<"globFiles">> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();
  const { path, globPattern } = tool.input || {};

  let resultEl: React.ReactNode | null = null;
  let files: string[] = [];
  let isTruncated = false;
  if (
    tool.state === "output-available" &&
    typeof tool.output === "object" &&
    tool.output !== null &&
    !("error" in tool.output)
  ) {
    files = tool.output.files;
    isTruncated = tool.output.isTruncated ?? false;
    resultEl =
      files.length > 0 ? (
        <FileList
          matches={files.map((file) => {
            return {
              file,
            };
          })}
        />
      ) : null;
  }

  const searchCondition = (
    <>
      {t("toolInvocation.in")} <HighlightedText>{path}</HighlightedText>
      {globPattern && (
        <>
          {t("toolInvocation.for")}{" "}
          <HighlightedText>{globPattern}</HighlightedText>
        </>
      )}
    </>
  );

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      <span>
        {isExecuting || tool.state !== "output-available" ? (
          <>
            {t("toolInvocation.searching")} {searchCondition}
          </>
        ) : (
          <>
            {t("toolInvocation.searching")} {searchCondition},{" "}
            {t("toolInvocation.matchCount", { count: files.length })}{" "}
            {isTruncated && t("toolInvocation.resultsTruncated")}
          </>
        )}
      </span>
    </>
  );

  return <ExpandableToolContainer title={title} expandableDetail={resultEl} />;
};
