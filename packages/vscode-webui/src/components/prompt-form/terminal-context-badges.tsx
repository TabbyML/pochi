import { CodeBlock, getLineCount } from "@/components/message";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useVisibleTerminals } from "@/lib/hooks/use-visible-terminals";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment } from "@/lib/vscode";
import type { TerminalTextSelection } from "@getpochi/common/vscode-webui-bridge";
import { TerminalIcon, X } from "lucide-react";
import type React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";

interface TerminalContextBadgesProps {
  selections: TerminalTextSelection[];
  onRemove?: (index: number) => void;
  className?: string;
}

/**
 * Renders the terminal selections the user explicitly attached via the
 * "Add to Chat" terminal context menu action, one removable badge per
 * selection. Unlike `TerminalSelectionPart` (read-only, used in rendered
 * messages), each badge here exposes a hover-revealed remove button, mirroring
 * the pattern used by `UserEdits`.
 */
export const TerminalContextBadges: React.FC<TerminalContextBadgesProps> = ({
  selections,
  onRemove,
  className,
}) => {
  const { t } = useTranslation();
  const { openBackgroundJobTerminal } = useVisibleTerminals();

  if (!selections.length) {
    return null;
  }

  return (
    <>
      {selections.map((selection, index) => {
        const { terminalName, backgroundJobId, content } = selection;
        const lineCount = getLineCount(content);

        const onClick = () => {
          if (!isVSCodeEnvironment() || !backgroundJobId) return;
          openBackgroundJobTerminal?.(backgroundJobId);
        };

        return (
          <HoverCard key={index} openDelay={300} closeDelay={200}>
            <HoverCardTrigger asChild>
              <div
                className={cn(
                  "group inline-flex h-[1.7rem] max-w-full cursor-pointer items-center gap-1 overflow-hidden truncate rounded-sm border border-[var(--vscode-chat-requestBorder)] px-1 hover:bg-accent/40",
                  className,
                )}
                onClick={onClick}
              >
                {onRemove ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("terminalContextBadge.remove")}
                    className="relative size-3.5 shrink-0 p-0 hover:bg-transparent"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(index);
                    }}
                  >
                    <TerminalIcon className="absolute size-3.5 transition-opacity duration-150 group-focus-within:opacity-0 group-hover:opacity-0" />
                    <X className="absolute size-3.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100" />
                  </Button>
                ) : (
                  <TerminalIcon className="size-3.5 shrink-0" />
                )}
                <span className="truncate text-sm">
                  {terminalName}
                  <span className="text-zinc-500 dark:text-zinc-400">
                    :{lineCount}
                  </span>
                </span>
              </div>
            </HoverCardTrigger>
            <HoverCardContent className="w-auto max-w-[90vw] p-0" align="start">
              <div className="flex max-w-[300px] items-center gap-1.5 truncate border-b px-2 py-1.5 font-medium text-xs">
                <TerminalIcon className="size-3.5 shrink-0" />
                <span className="truncate">{terminalName}</span>
              </div>
              <div className="max-h-[60vh] overflow-auto">
                <CodeBlock
                  language="shell"
                  value={content}
                  isMinimalView={true}
                  className="m-0 border-none"
                />
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </>
  );
};
