import { useTranslation } from "react-i18next";
import { usePreviewEdit } from "../hooks/use-preview-edit";
import { ModelEdits } from "./code-edits";
import { FileBadge } from "./file-badge";
import { NewProblems, NewProblemsIcon } from "./new-problems";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

export const writeToFileTool: React.FC<ToolProps<"writeToFile">> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();

  const { path } = tool.input || {};

  const result =
    tool.state === "output-available" && !("error" in tool.output)
      ? tool.output
      : undefined;

  // Before the tool call is approved/executed there is no result yet, so
  // compute a preview diff from the tool input to show the pending changes.
  const preview = usePreviewEdit(
    "writeToFile",
    tool.input,
    tool.state === "input-available",
  );

  const edit = result?._meta?.edit ?? preview?.edit;
  const editSummary = result?._meta?.editSummary ?? preview?.editSummary;

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {t("toolInvocation.writing")}
      {path && (
        <FileBadge className="ml-1" path={path} editSummary={editSummary} />
      )}
    </>
  );

  const details = [];

  if (edit) {
    details.push(<ModelEdits key="model-edits" edit={edit} filePath={path} />);
  }

  if (result?.newProblems) {
    details.push(
      <NewProblems key="new-problems" newProblems={result?.newProblems} />,
    );
  }

  const expandableDetail = details.length > 0 ? <>{details}</> : undefined;

  return (
    <ExpandableToolContainer
      title={title}
      expandableDetail={expandableDetail}
      expandableDetailIcon={result?.newProblems && <NewProblemsIcon />}
    />
  );
};
