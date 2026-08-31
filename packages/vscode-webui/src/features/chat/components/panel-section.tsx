import { cn } from "@/lib/utils";
import { ChevronRightIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * One category of the background panel. The title row doubles as the collapse
 * control, so there is no extra button to aim at, and the count stays visible
 * while the section is folded.
 *
 * Lives in its own file because both `manage-panel.tsx` and the dev-only
 * `background-task-debug-panel.tsx` use it, and the former imports the latter.
 */
export function PanelSection({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={!isCollapsed}
        onClick={() => setIsCollapsed((prev) => !prev)}
        className={cn(
          "flex items-center justify-between gap-2 rounded-md px-2 py-1",
          "text-left transition-colors hover:bg-muted/60",
        )}
      >
        <span className="flex min-w-0 items-center gap-1">
          <ChevronRightIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              !isCollapsed && "rotate-90",
            )}
          />
          {/* No colour override: inheriting the popover's own foreground keeps
              the title at full contrast instead of the dimmer `--foreground`. */}
          <span className="truncate font-semibold text-sm">{label}</span>
        </span>
        <span className="shrink-0 text-muted-foreground text-xs">{count}</span>
      </button>
      {!isCollapsed && children}
    </div>
  );
}

/** How many rows a category shows before it has to be asked for the rest. */
const CollapsedItemCount = 5;

/**
 * Caps a category's rows and hands back the control that reveals the rest, so
 * every category in the panel truncates the same way. The state lives here, so
 * one long category can be expanded without touching its neighbours.
 */
export function useCappedList<T>(items: readonly T[]) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hiddenCount = items.length - CollapsedItemCount;

  return {
    visibleItems: isExpanded ? items : items.slice(0, CollapsedItemCount),
    seeMoreButton:
      hiddenCount > 0 ? (
        <SeeMoreButton
          isExpanded={isExpanded}
          onToggle={() => setIsExpanded((prev) => !prev)}
        />
      ) : null,
  };
}

function SeeMoreButton({
  isExpanded,
  onToggle,
}: {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        // Reads as a text link, not a row: only the label brightens on hover,
        // so it never competes with the item rows for attention. Centring the
        // label breaks the rows' left alignment, so it cannot be mistaken for
        // one more item in the list.
        "px-2 py-1 text-center text-muted-foreground text-xs",
        "transition-colors hover:text-foreground",
      )}
    >
      {/* The section header already carries the true total, so the toggle
          does not repeat it. */}
      {isExpanded ? t("managePanel.seeLess") : t("managePanel.seeMore")}
    </button>
  );
}
