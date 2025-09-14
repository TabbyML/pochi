import { isFolder } from "@/lib/utils/file";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FileBadge } from "../file-badge";
import { FileList } from "../file-list";
import { StatusIcon } from "../status-icon";
import { ExpandableToolContainer } from "../tool-container";
import type { ToolProps } from "../types";

export const listFilesTool: React.FC<ToolProps<"listFiles">> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();
  const { path } = tool.input || {};
  const isDirectory = useMemo(() => {
    return isFolder(path ?? "");
  }, [path]);

  let resultEl: React.ReactNode | null = null;
  let files: string[] = [];
  let isTruncated = false;
  if (tool.state === "output-available" && !("error" in tool.output)) {
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

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {t('toolInvocation.reading')}{" "}
      <FileBadge className="ml-1" path={path ?? ""} isDirectory={isDirectory} />
      {tool.state === "output-available" && (
        <>
          , {t('toolInvocation.result')} {isTruncated && t('toolInvocation.resultsTruncated')}
        </>
      )}
    </>
  );

  return <ExpandableToolContainer title={title} expandableDetail={resultEl} />;
};
