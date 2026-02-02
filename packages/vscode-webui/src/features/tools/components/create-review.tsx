import { useReviews } from "@/lib/hooks/use-reviews";
import { vscodeHost } from "@/lib/vscode";
import { useTranslation } from "react-i18next";
import { FileBadge } from "./file-badge";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

export const createReviewTool: React.FC<ToolProps<"createReview">> = ({
  tool,
  isExecuting,
}) => {
  const { path, startLine, endLine, comment } = tool.input || {};
  const reviews = useReviews();
  const { t } = useTranslation();
  const reviewId =
    tool.state === "output-available" &&
    tool.output &&
    typeof tool.output === "object" &&
    "reviewId" in tool.output
      ? tool.output.reviewId
      : undefined;
  const handleOpen = () => {
    if (!reviewId) return;
    const review = reviews.find((x) => x.id === reviewId);
    if (!review) return;
    vscodeHost.openReview(review, {
      revealRange: true,
      focusCommentsPanel: true,
    });
  };
  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2" />
      {t("toolInvocation.addingReviewComment")}
      {path && (
        <FileBadge
          className="ml-1"
          path={path}
          startLine={startLine}
          endLine={endLine}
          onClick={reviewId ? handleOpen : undefined}
        />
      )}
    </>
  );

  const expandableDetail = comment ? (
    <div className="whitespace-pre-wrap rounded bg-muted/50 px-2 py-1 text-sm italic">
      {comment}
    </div>
  ) : null;

  return (
    <ExpandableToolContainer
      title={title}
      expandableDetail={expandableDetail}
    />
  );
};
