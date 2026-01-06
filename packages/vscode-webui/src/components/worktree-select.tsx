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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { getWorktreeNameFromWorktreePath } from "@getpochi/common/git-utils";
import {
  type GitWorktree,
  WorktreePrefix,
} from "@getpochi/common/vscode-webui-bridge";
import { DropdownMenuPortal } from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import {
  CheckIcon,
  CirclePlus,
  CloudIcon,
  GitBranchIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export type CreateWorktreeType = GitWorktree | "new-worktree" | undefined;

interface WorktreeSelectProps {
  cwd: string;
  worktrees: GitWorktree[];
  showCreateWorktree?: boolean;
  value: CreateWorktreeType;
  onChange: (v: CreateWorktreeType) => void;
  isLoading?: boolean;
  baseBranch?: string;
  onBaseBranchChange?: (branch: string | undefined) => void;
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

function BaseBranchSelector({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v: string) => void;
}) {
  const { data: branches } = useQuery({
    queryKey: ["git-branches"],
    queryFn: () => vscodeHost.readGitBranches(50),
  });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { t } = useTranslation();

  const filteredBranches = branches?.filter((branch) => {
    const branchName = branch.replace(/^origin\//, "");
    return (
      branchName.toLowerCase().includes(search.toLowerCase()) ||
      branch.toLowerCase().includes(search.toLowerCase())
    );
  });

  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setSearch("");
        }
      }}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-6 w-auto gap-0 px-0">
                {value && (
                  <span className="ml-1 max-w-[8rem] truncate text-sm">
                    {value}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t("worktreeSelect.switchBaseBranch")}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent
        className="max-h-[300px] w-[200px] overflow-y-auto border bg-background p-0 text-popover-foreground shadow"
        align="start"
      >
        <div className="sticky top-0 z-10 bg-background p-1">
          <Input
            placeholder={t("worktreeSelect.searchBranch")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            className="h-8 text-xs focus-visible:ring-1"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((prev) =>
                  Math.min(prev + 1, (filteredBranches?.length ?? 0) - 1),
                );
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (filteredBranches?.[selectedIndex]) {
                  onChange(filteredBranches[selectedIndex]);
                  setOpen(false);
                  setSearch("");
                }
              }
            }}
          />
        </div>
        <div className="p-1">
          {filteredBranches?.length === 0 && (
            <div className="py-2 text-center text-muted-foreground text-xs">
              {t("worktreeSelect.noBranchFound")}
            </div>
          )}
          {filteredBranches?.map((branch, index) => {
            const isRemote = branch.startsWith("origin/");
            const displayName = isRemote
              ? branch
              : branch.replace(/^heads\//, "");
            return (
              <DropdownMenuItem
                key={branch}
                onSelect={() => {
                  onChange(branch === value ? "" : branch);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "cursor-pointer",
                  selectedIndex === index &&
                    "bg-accent/60 text-accent-foreground",
                  value === branch && "bg-accent text-accent-foreground",
                )}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {isRemote ? (
                  <CloudIcon className={cn(" h-4 w-4 shrink-0")} />
                ) : (
                  <GitBranchIcon className={cn(" h-4 w-4 shrink-0")} />
                )}
                <span className="truncate">{displayName}</span>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WorktreeSelect({
  cwd,
  worktrees,
  value,
  onChange,
  isLoading,
  showCreateWorktree,
  baseBranch,
  onBaseBranchChange,
}: WorktreeSelectProps) {
  const { t } = useTranslation();

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
      <div className="flex h-6 select-none items-center overflow-visible">
        {isNewWorktree && onBaseBranchChange && (
          <BaseBranchSelector
            value={baseBranch}
            onChange={onBaseBranchChange}
          />
        )}
        <DropdownMenu>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="button-focus h-6 max-w-[40vw] items-center gap-0 overflow-visible py-0 pr-1 pl-0 font-normal has-[>svg]:px-1"
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
                    onClick={() => onChange("new-worktree")}
                    className="cursor-pointer py-2"
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
