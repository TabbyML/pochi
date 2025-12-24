import { useToolCallLifeCycle } from "@/features/chat";
import { getToolName } from "ai";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModelEdits } from "./code-edits";
import { FileBadge } from "./file-badge";
import { NewProblems, NewProblemsIcon } from "./new-problems";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

export const writeToFileTool: React.FC<ToolProps<"writeToFile">> = ({
  tool,
  isExecuting,
  changes,
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const lifecycle = useToolCallLifeCycle().getToolCallLifeCycle({
    toolName: getToolName(tool),
    toolCallId: tool.toolCallId,
  });
  const shouldPreview = useMemo(() => {
    return (
      tool.state !== "output-available" &&
      (lifecycle.status === "init" ||
        lifecycle.status === "pending" ||
        lifecycle.status === "ready")
    );
  }, [tool.state, lifecycle.status]);

  const handleClick = useCallback(() => {
    if (shouldPreview) {
      lifecycle.preview(tool.input, tool.state);
    } else {
      setIsExpanded((prev) => !prev);
    }
  }, [shouldPreview, tool.input, tool.state, lifecycle.preview]);

  const { path } = tool.input || {};

  const result =
    tool.state === "output-available" && !("error" in tool.output)
      ? tool.output
      : undefined;

  const previewInfo =
    lifecycle.previewResult &&
    "success" in lifecycle.previewResult &&
    lifecycle.previewResult.success
      ? lifecycle.previewResult?._meta
      : undefined;

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {t("toolInvocation.writing")}
      {path && (
        <FileBadge
          className="ml-1"
          path={path}
          onClick={handleClick}
          editSummary={result?._meta?.editSummary ?? previewInfo?.editSummary}
          changes={result?.success ? changes : undefined}
        />
      )}
    </>
  );

  const details = [];

  if (result?._meta?.edit) {
    details.push(<ModelEdits key="model-edits" edit={result?._meta?.edit} />);
  }

  if (result?.newProblems) {
    details.push(
      <NewProblems key="new-problems" newProblems={result?.newProblems} />,
    );
  }

  const expandableDetail = details.length > 0 ? <>{details}</> : undefined;

  const detail = previewInfo?.edit ? (
    <ModelEdits edit={previewInfo.edit} />
  ) : null;

  return (
    <ExpandableToolContainer
      title={title}
      expandableDetail={expandableDetail}
      expandableDetailIcon={result?.newProblems && <NewProblemsIcon />}
      detail={detail}
      isExpanded={isExpanded}
      onToggle={setIsExpanded}
    />
  );
};
