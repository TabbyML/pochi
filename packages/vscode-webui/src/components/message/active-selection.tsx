import { CodeBlock } from "@/components/message";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { FileBadge } from "@/features/tools";
import { getActiveSelectionLabel } from "@/lib/utils/active-selection";
import {
  getFileExtension,
  languageIdFromExtension,
} from "@/lib/utils/languages";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import type { ActiveSelection } from "@getpochi/common/vscode-webui-bridge";
import type React from "react";
import { useTranslation } from "react-i18next";

interface Props {
  activeSelection: ActiveSelection;
}

export const ActiveSelectionPart: React.FC<Props> = ({ activeSelection }) => {
  const { t } = useTranslation();

  if (!activeSelection) return null;

  const { filepath, range, content, notebookCell } = activeSelection;

  if (content.length === 0) {
    return null;
  }

  const extension = getFileExtension(filepath);
  const language = languageIdFromExtension(extension) || "typescript";

  const onClick = () => {
    if (!isVSCodeEnvironment()) return;
    vscodeHost.openFile(filepath, {
      start: range.start.line + 1,
      end: range.end.line + 1,
      cellId: notebookCell?.cellId,
    });
  };

  return (
    <HoverCard openDelay={300} closeDelay={200}>
      <HoverCardTrigger asChild>
        <div className="inline-block">
          <FileBadge
            path={filepath}
            label={getActiveSelectionLabel(activeSelection, t)}
            startLine={range.start.line + 1}
            endLine={range.end.line + 1}
            onClick={onClick}
          />
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-auto max-w-[90vw] p-0" align="start">
        <div className="max-h-[60vh] overflow-auto">
          <CodeBlock
            language={language}
            value={content}
            isMinimalView={true}
            className="m-0 border-none"
          />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
