"use client";

import LoadingWrapper from "@/components/loading-wrapper";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getWorktreeNameFromWorktreePath } from "@getpochi/common/git-utils";
import {
  type GitWorktree,
  WorktreePrefix,
} from "@getpochi/common/vscode-webui-bridge";
import { DropdownMenuPortal } from "@radix-ui/react-dropdown-menu";
import { CheckIcon, CirclePlus, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

export type CreateWorktreeType = GitWorktree | "new-worktree" | undefined;

interface WorktreeSelectProps {
  cwd: string;
  worktrees: GitWorktree[];
  showCreateWorktree?: boolean;
  value: CreateWorktreeType;
  onChange: (v: CreateWorktreeType) => void;
  isLoading?: boolean;
  triggerClassName?: string;
}

const getWorktreeName = (worktree: GitWorktree | undefined) => {
  if (!worktree) {
    return;
  }
  if (worktree.isMain) {
    return "workspace";
  }
  return getWorktreeNameFromWorktreePath(worktree.path);
};

export function WorktreeSelect({
  cwd,
  worktrees,
  value,
  onChange,
  isLoading,
  showCreateWorktree,
  triggerClassName,
}: WorktreeSelectProps) {
  const { t } = useTranslation();
  const onCreateWorkTree = async () => {
    onChange("new-worktree");
  };

  const isNewWorktree = value === "new-worktree";
  return (
    <LoadingWrapper
      loading={isLoading}
      fallback={
        <div className="p-1">
          <Skeleton className="h-4 w-32 bg-[var(--vscode-inputOption-hoverBackground)]" />
        </div>
      }
    >
      <div className="h-6 select-none overflow-visible">
        <DropdownMenu>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className={cn(
                      "!px-1 button-focus h-6 max-w-[40vw] items-center overflow-visible py-0 font-normal",
                      triggerClassName,
                    )}
                  >
                    <span
                      className={cn(
                        "truncate whitespace-nowrap transition-colors duration-200",
                        !value && "text-muted-foreground",
                      )}
                    >
                      {value === "new-worktree" || value?.path === cwd
                        ? "\b"
                        : (getWorktreeName(value) ??
                          t("worktreeSelect.selectWorktree"))}
                    </span>
                    <div
                      className={cn("relative inline-flex items-center", {
                        "pr-2": isNewWorktree,
                      })}
                    >
                      <span
                        className={cn(
                          "font-bold text-base leading-none",
                          !value && "text-muted-foreground",
                        )}
                      >
                        {WorktreePrefix}
                      </span>
                      {isNewWorktree && (
                        <CirclePlus className="-right-0.5 -top-1 absolute size-3" />
                      )}
                    </div>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("worktreeSelect.selectWorktree")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenuPortal>
            <DropdownMenuContent
              onCloseAutoFocus={(e) => e.preventDefault()}
              side="bottom"
              align="end"
              alignOffset={-6}
              className="dropdown-menu max-h-[32vh] min-w-[18rem] max-w-[80vw] animate-in overflow-y-auto overflow-x-hidden rounded-md border bg-background p-2 text-popover-foreground shadow"
            >
              {showCreateWorktree && (
                <>
                  <DropdownMenuItem
                    onClick={onCreateWorkTree}
                    className="cursor-pointer py-2 pl-2"
                  >
                    {isNewWorktree ? (
                      <CheckIcon
                        className={cn("mr-2 shrink-0", "opacity-100")}
                      />
                    ) : (
                      <PlusIcon className="mr-2 shrink-0" />
                    )}
                    <div>
                      <div className="font-semibold">
                        {t("worktreeSelect.createWorktree")}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {t("worktreeSelect.createWorktreeDescription")}
                      </div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {worktrees?.map((item: GitWorktree) => {
                const isSelected =
                  value === "new-worktree" ? false : item.path === value?.path;
                return (
                  <DropdownMenuItem
                    onClick={(e: React.MouseEvent) => {
                      onChange(item);
                      e.stopPropagation();
                    }}
                    key={item.path}
                    className="cursor-pointer py-2 pl-2"
                    title={item.path}
                  >
                    <CheckIcon
                      className={cn(
                        "mr-2 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="overflow-x-hidden">
                      <div
                        className={cn("truncate", {
                          "font-semibold": isSelected,
                        })}
                      >
                        {getWorktreeName(item)}
                      </div>
                      <div className="truncate text-muted-foreground text-xs">
                        {item.path}
                      </div>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      </div>
    </LoadingWrapper>
  );
}
