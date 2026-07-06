import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { AtSign, Paperclip, Plus, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";

interface AddContextMenuProps {
  onAddFilesAndFolders: () => void;
  onAttachFile?: () => void;
  onSelectTodoMode?: () => void;
  /**
   * When true, the todo mode item is rendered but not selectable (e.g. the task
   * already has active todos). The item stays visible for discoverability.
   */
  todoModeDisabled?: boolean;
  showLabel?: boolean;
  /**
   * Which side of the trigger the menu opens on. Hardcode "bottom" for the
   * sidebar (input near the top) and "top" for the in-task toolbar (input at
   * the bottom) to avoid the menu flipping into an off-screen position.
   */
  side?: "top" | "bottom";
}

export function AddContextMenu({
  onAddFilesAndFolders,
  onAttachFile,
  onSelectTodoMode,
  todoModeDisabled = false,
  showLabel = false,
  side = "top",
}: AddContextMenuProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label={t("addContextMenu.trigger")}
          className={cn(
            "h-[1.7rem] shrink-0 border border-[var(--vscode-chat-requestBorder)] bg-transparent py-0 text-muted-foreground focus-visible:border-[var(--vscode-focusBorder)] focus-visible:ring-0 focus-visible:ring-transparent",
            showLabel ? "gap-1 px-2" : "w-[1.7rem] p-0",
          )}
        >
          <Plus className="size-3.5" />
          {showLabel && (
            <span className="text-sm">{t("addContextMenu.trigger")}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={side}
        sideOffset={6}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="dropdown-menu !bg-background w-[320px] max-w-(--radix-dropdown-menu-content-available-width) border p-2 text-popover-foreground shadow-md"
      >
        <DropdownMenuItem
          className="cursor-pointer items-start gap-2 px-2 py-1.5"
          onSelect={onAddFilesAndFolders}
        >
          <AtSign className="mt-0.5 size-4" />
          <div className="min-w-0">
            <div className="font-medium">{t("addContextMenu.files")}</div>
            <div className="truncate text-muted-foreground text-xs">
              {t("addContextMenu.filesDescription")}
            </div>
          </div>
        </DropdownMenuItem>
        {onAttachFile && (
          <DropdownMenuItem
            className="cursor-pointer items-start gap-2 px-2 py-1.5"
            onSelect={onAttachFile}
          >
            <Paperclip className="mt-0.5 size-4" />
            <div className="min-w-0">
              <div className="font-medium">{t("addContextMenu.attach")}</div>
              <div className="truncate text-muted-foreground text-xs">
                {t("addContextMenu.attachDescription")}
              </div>
            </div>
          </DropdownMenuItem>
        )}
        {onSelectTodoMode && (
          <DropdownMenuItem
            className="cursor-pointer items-start gap-2 px-2 py-1.5"
            disabled={todoModeDisabled}
            onSelect={onSelectTodoMode}
          >
            <Target className="mt-0.5 size-4" />
            <div className="min-w-0">
              <div className="font-medium">{t("chat.todoModeLabel")}</div>
              <div className="truncate text-muted-foreground text-xs">
                {t(
                  todoModeDisabled
                    ? "addContextMenu.todoDisabledDescription"
                    : "addContextMenu.todoDescription",
                )}
              </div>
            </div>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
