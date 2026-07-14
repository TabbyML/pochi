import { cn } from "@/lib/utils";
import { Target, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";

interface TodoModeBadgeProps {
  onRemove: () => void;
}

export function TodoModeBadge({ onRemove }: TodoModeBadgeProps) {
  const { t } = useTranslation();

  return (
    <div className="todo-mode-badge-enter inline-flex h-6 items-center gap-1.5">
      <span className="h-4 border-border border-l" />
      <div
        className={cn(
          "group inline-flex h-6 max-w-full items-center gap-1 overflow-hidden rounded-md px-1.5 py-0 text-foreground text-sm leading-none",
          "transition-colors duration-150 ease-out focus-within:bg-muted/50 hover:bg-muted/50",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("todoModeBadge.remove")}
          className="relative size-4 shrink-0 p-0 hover:bg-transparent"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <Target className="absolute size-3.5 transition-opacity duration-150 group-focus-within:opacity-0 group-hover:opacity-0" />
          <X className="absolute size-3.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100" />
        </Button>
        <span className="transition-colors duration-150">
          {t("chat.todoModeLabel")}
        </span>
      </div>
    </div>
  );
}
