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
import { cn } from "@/lib/utils";
import { getWorktreeNameFromWorktreePath } from "@/lib/utils/file";
import { vscodeHost } from "@/lib/vscode";
import type { GitWorktree } from "@getpochi/common/vscode-webui-bridge";
import { DropdownMenuPortal } from "@radix-ui/react-dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, FolderGit2, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface WorktreeSelectProps {
  cwd: string;
  worktrees: GitWorktree[];
  showCreateWorktree?: boolean;
  value: GitWorktree | undefined;
  onChange: (v: GitWorktree) => void;
  isLoading?: boolean;
  triggerClassName?: string;
}

const getWorktreeName = (worktree: GitWorktree | undefined) => {
  if (!worktree) {
    return;
  }
  if (worktree.isMain) {
    return worktree.branch || "main";
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
  const queryClient = useQueryClient();
  const onCreateWorkTree = async () => {
    try {
      const newWorktree = await vscodeHost.createWorktree();
      if (newWorktree) {
        await queryClient.invalidateQueries({
          queryKey: ["worktrees"],
        });
        setTimeout(() => {
          onChange(newWorktree);
        });
      }
    } catch (e) {
      // ignore
    }
  };

  const isMainWorkspace = value?.path === cwd;
  return (
    <LoadingWrapper
      loading={isLoading}
      fallback={
        <div className="p-1">
          <Skeleton className="h-4 w-32 bg-[var(--vscode-inputOption-hoverBackground)]" />
        </div>
      }
    >
      <div className="h-6 select-none overflow-hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "!px-1 button-focus h-6 max-w-full items-center py-0 font-normal",
                triggerClassName,
              )}
            >
              <span
                className={cn(
                  "truncate whitespace-nowrap transition-colors duration-200",
                  !value && "text-muted-foreground",
                )}
              >
                {isMainWorkspace
                  ? "\b"
                  : (getWorktreeName(value) ??
                    t("worktreeSelect.selectWorktree"))}
              </span>
              <FolderGit2
                className={cn(
                  "size-4 shrink-0 scale-110 transition-colors duration-200",
                  !value && "text-muted-foreground",
                )}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              onCloseAutoFocus={(e) => e.preventDefault()}
              side="bottom"
              align="start"
              alignOffset={6}
              className="dropdown-menu max-h-[32vh] min-w-[18rem] animate-in overflow-y-auto overflow-x-hidden rounded-md border bg-background p-2 text-popover-foreground shadow"
            >
              <div>
                {worktrees?.map((item: GitWorktree) => {
                  const isSelected = item.path === value?.path;
                  return (
                    <DropdownMenuItem
                      onClick={(e: React.MouseEvent) => {
                        onChange(item);
                        e.stopPropagation();
                      }}
                      key={item.path}
                      className="cursor-pointer py-2 pl-2"
                    >
                      <CheckIcon
                        className={cn(
                          "mr-2 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div>
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
              </div>
              {showCreateWorktree && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onCreateWorkTree}
                    className="cursor-pointer py-2 pl-2"
                  >
                    <PlusIcon className="mr-2 shrink-0" />
                    <div>
                      <div className="font-semibold">
                        {t("worktreeSelect.createWorktree")}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {t("worktreeSelect.createWorktreeDescription")}
                      </div>
                    </div>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      </div>
    </LoadingWrapper>
  );
}
