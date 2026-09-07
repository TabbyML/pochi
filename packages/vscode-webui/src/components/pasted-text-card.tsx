import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { getPastedTextTitle } from "@getpochi/common";
import { FileText, X } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const DisplayTitleMaxLength = 12;

function getDisplayTitle(title: string): string {
  const characters = Array.from(title);
  if (characters.length <= DisplayTitleMaxLength) return title;
  return `${characters.slice(0, DisplayTitleMaxLength - 1).join("")}…`;
}

export const PastedTextCard = memo(function PastedTextCard({
  text,
  onRemove,
  className,
}: {
  text: string;
  onRemove?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const title = useMemo(() => getPastedTextTitle(text), [text]);
  const accessibleTitle = title || t("pastedText.label");
  const displayTitle = useMemo(
    () => getDisplayTitle(accessibleTitle),
    [accessibleTitle],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open || !isPinned) setIsOpen(open);
    },
    [isPinned],
  );

  const togglePinned = useCallback(() => {
    setIsPinned((pinned) => {
      const nextPinned = !pinned;
      setIsOpen(nextPinned);
      return nextPinned;
    });
  }, []);

  const closePreview = useCallback(() => {
    setIsPinned(false);
    setIsOpen(false);
  }, []);

  return (
    <HoverCard
      open={isOpen}
      onOpenChange={handleOpenChange}
      openDelay={150}
      closeDelay={150}
    >
      <div
        className={cn(
          "relative flex h-14 w-36 min-w-0 max-w-full rounded-md border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] hover:border-[var(--vscode-focusBorder)]",
          className,
        )}
        data-testid="pasted-text-card"
      >
        <HoverCardTrigger asChild>
          <button
            type="button"
            aria-label={accessibleTitle}
            aria-expanded={isOpen}
            onClick={togglePinned}
            className={cn(
              "flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--vscode-list-hoverBackground)] focus-visible:outline-1 focus-visible:outline-[var(--vscode-focusBorder)]",
              onRemove && "pr-5",
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded bg-muted">
              <FileText className="size-4 text-muted-foreground" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-xs">
                {displayTitle}
              </span>
              <span className="truncate text-[10px] text-muted-foreground">
                {t("pastedText.label")}
              </span>
            </span>
          </button>
        </HoverCardTrigger>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("pastedText.remove")}
            className="-top-2 -right-2 absolute flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary p-0.5 text-secondary-foreground opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      <HoverCardContent
        align="start"
        className="max-h-80 w-[min(48rem,80vw)] overflow-auto p-0"
        onEscapeKeyDown={closePreview}
        onPointerDownOutside={closePreview}
      >
        <pre className="m-0 whitespace-pre-wrap break-words p-3 font-mono text-xs">
          {text}
        </pre>
      </HoverCardContent>
    </HoverCard>
  );
});

export const PastedTextFileCard = memo(function PastedTextFileCard({
  title,
  onOpen,
  className,
}: {
  title: string;
  onOpen: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const accessibleTitle = title || t("pastedText.label");
  const displayTitle = getDisplayTitle(accessibleTitle);

  return (
    <div
      className={cn(
        "relative flex h-8 min-w-0 max-w-full rounded-md border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] hover:border-[var(--vscode-focusBorder)]",
        className,
      )}
      data-testid="pasted-text-card"
    >
      <button
        type="button"
        aria-label={accessibleTitle}
        onClick={onOpen}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-[var(--vscode-list-hoverBackground)] focus-visible:outline-1 focus-visible:outline-[var(--vscode-focusBorder)]"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          <FileText className="size-3.5 text-muted-foreground" />
        </span>
        <span className="truncate font-medium text-xs">{displayTitle}</span>
      </button>
    </div>
  );
});
