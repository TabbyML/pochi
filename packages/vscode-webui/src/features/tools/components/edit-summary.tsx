import { cn } from "@/lib/utils";

export const EditSummary: React.FC<{
  editSummary: { added: number; removed: number };
  className?: string;
}> = ({ editSummary, className }) => {
  return (
    <span className={cn("mx-1", className)}>
      {editSummary.added > 0 && (
        <span className="ml-1 text-[var(--vscode-editorGutter-addedBackground)]">
          +{editSummary.added}
        </span>
      )}
      {editSummary.removed > 0 && (
        <span className="ml-1 text-[var(--vscode-editorGutter-deletedBackground)]">
          -{editSummary.removed}
        </span>
      )}
    </span>
  );
};
