import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useTaskReadStatusStore } from "@/features/chat";
import { useWorktrees } from "@/lib/hooks/use-worktrees";
import { vscodeHost } from "@/lib/vscode";
import { getWorktreeNameFromWorktreePath } from "@getpochi/common/git-utils";
import type { Task } from "@getpochi/livekit";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { TaskRow } from "./task-row";

interface WorktreeGroup {
  name: string;
  path: string;
  tasks: Task[];
  isDeleted: boolean;
  createdAt?: number;
}

export function WorktreeList({
  tasks,
  cwd,
  workspaceFolder,
}: {
  tasks: Task[];
  cwd: string;
  workspaceFolder?: string | null;
}) {
  const { t } = useTranslation();
  const { data: worktrees } = useWorktrees();
  const [showDeleted, setShowDeleted] = useState(false);

  const groups = useMemo(() => {
    const worktreeMap = new Map(worktrees?.map((wt) => [wt.path, wt]));
    const worktreeIndexMap = new Map(
      worktrees?.map((wt, index) => [wt.path, index]),
    );

    // 1. Group tasks by cwd (worktree path)
    const taskGroups = R.pipe(
      tasks,
      R.filter((task) => !!task.cwd),
      R.groupBy((task) => task.cwd as string),
      R.mapValues((tasks, path) => {
        const latestTask = R.pipe(
          tasks,
          R.sortBy([(task) => new Date(task.createdAt).getTime(), "desc"]),
          R.first(),
        );
        return {
          path,
          tasks,
          createdAt: latestTask ? new Date(latestTask.createdAt).getTime() : 0,
        };
      }),
    );

    // 2. Create groups for worktrees without tasks
    const worktreeGroups = R.pipe(
      worktrees || [],
      R.filter((wt) => !taskGroups[wt.path]),
      R.map((wt) => ({
        path: wt.path,
        tasks: [],
        createdAt: 0,
      })),
      R.groupBy((g) => g.path),
      R.mapValues((groups) => groups[0]),
    );

    // 3. Merge and resolve names/isDeleted
    return R.pipe(
      { ...taskGroups, ...worktreeGroups },
      R.values(),
      R.map((group): WorktreeGroup => {
        const wt = worktreeMap.get(group.path);
        let name = "unknown";
        let isDeleted = true;

        if (wt) {
          isDeleted = false;
          if (wt.isMain) {
            name = "main";
          } else {
            name = getWorktreeNameFromWorktreePath(wt.path) || "unknown";
          }
        } else {
          name = getWorktreeNameFromWorktreePath(group.path) || "unknown";
        }

        return {
          ...group,
          name,
          isDeleted,
        };
      }),
      R.sort((a, b) => {
        // Sort: Existing first, then deleted
        if (a.isDeleted !== b.isDeleted) {
          return a.isDeleted ? 1 : -1;
        }

        if (!a.isDeleted) {
          const indexA =
            worktreeIndexMap.get(a.path) ?? Number.POSITIVE_INFINITY;
          const indexB =
            worktreeIndexMap.get(b.path) ?? Number.POSITIVE_INFINITY;
          return indexA - indexB;
        }

        return a.name.localeCompare(b.name);
      }),
    );
  }, [tasks, worktrees]);

  const activeGroups = groups.filter((g) => !g.isDeleted);
  const deletedGroups = groups.filter((g) => g.isDeleted);

  return (
    <div className="flex flex-col gap-4">
      {activeGroups.map((group) => (
        <WorktreeSection
          key={group.path}
          group={group}
          cwd={cwd}
          workspaceFolder={workspaceFolder}
        />
      ))}

      {deletedGroups.length > 0 && (
        <>
          <div className="flex items-center py-2">
            <div className="h-px flex-1 bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="mx-2 h-auto py-0 text-muted-foreground text-xs hover:bg-transparent"
              onClick={() => setShowDeleted(!showDeleted)}
            >
              {showDeleted
                ? t("tasksPage.hideDeletedWorktrees", {
                    count: deletedGroups.length,
                  })
                : t("tasksPage.showDeletedWorktrees", {
                    count: deletedGroups.length,
                  })}
            </Button>
            <div className="h-px flex-1 bg-border" />
          </div>

          {showDeleted &&
            deletedGroups.map((group) => (
              <WorktreeSection
                key={group.path}
                group={group}
                cwd={cwd}
                workspaceFolder={workspaceFolder}
              />
            ))}
        </>
      )}
    </div>
  );
}

function WorktreeSection({
  group,
}: {
  group: WorktreeGroup;
  cwd: string;
  workspaceFolder?: string | null;
}) {
  const { t } = useTranslation();
  // Default expanded for existing worktrees, collapsed for deleted
  const [isExpanded, setIsExpanded] = useState(!group.isDeleted);
  const unreadTaskIds = useTaskReadStatusStore((state) => state.unreadTaskIds);
  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={setIsExpanded}
      className="rounded-lg border bg-card text-card-foreground shadow-sm"
    >
      <div className="flex items-center justify-between px-3 py-2">
        <CollapsibleTrigger asChild>
          <div className="flex cursor-pointer select-none items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
            <span className="font-semibold">{group.name}</span>
            {group.isDeleted && (
              <Badge variant="destructive" className="ml-2">
                <Trash2 className="mr-1 size-3" />
                {t("tasksPage.deleted")}
              </Badge>
            )}
          </div>
        </CollapsibleTrigger>
        <div className="flex items-center gap-2">
          {!group.isDeleted && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => {
                vscodeHost.openTaskInPanel({
                  cwd: group.path,
                  uid: crypto.randomUUID(),
                });
              }}
            >
              <Plus className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <CollapsibleContent>
        <div className="border-t p-4">
          <div className="flex flex-col gap-2">
            {group.tasks.length > 0 ? (
              group.tasks.map((task) => {
                const isRead = !unreadTaskIds.has(task.id);

                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    worktreeName={group.name}
                    isWorktreeExist={!group.isDeleted}
                    isRead={isRead}
                  />
                );
              })
            ) : (
              <div className="py-2 text-muted-foreground text-sm italic">
                {t("tasksPage.emptyState.description")}
              </div>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
