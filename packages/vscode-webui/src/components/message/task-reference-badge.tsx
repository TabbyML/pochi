import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { useTasks } from "@/lib/use-tasks";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import { MessageSquare } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMentionedTaskTitle } from "./task-reference-context";

interface TaskReferenceBadgeProps {
  id: string;
  /** Title recorded at mention time; falls back to the task's own title. */
  title?: string;
  className?: string;
}

/** Resolves a referenced task from the task history, with a title fallback. */
export function useTaskReference(id: string, title?: string) {
  const { t } = useTranslation();
  const tasks = useTasks();
  const task = useMemo(() => tasks.find((x) => x.id === id), [tasks, id]);
  const mentionedTitle = useMentionedTaskTitle(id);
  const displayTitle =
    title?.trim() ||
    mentionedTitle?.trim() ||
    task?.title?.trim() ||
    t("mentionList.untitledTask");
  return { task, displayTitle };
}

/**
 * Badge for a referenced task, shown for a `<task-reference>` tag in a sent
 * message and for reads of a task transcript. Clicking opens the task in a
 * panel when the task's working directory is known.
 */
export function TaskReferenceBadge({
  id,
  title,
  className,
}: TaskReferenceBadgeProps) {
  const { jwt } = usePochiCredentials();
  const { task, displayTitle } = useTaskReference(id, title);
  // A transcript can come from a client that is not in this task history
  // (e.g. the CLI); without a history entry its working directory is
  // unknown, so the badge is not clickable.
  const cwd = task?.cwd;

  const openTask = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!cwd) return;
      vscodeHost.openTaskInPanel(
        {
          type: "open-task",
          cwd,
          uid: id,
          storeId: encodeStoreId(jwt, task?.parentId || id),
        },
        { showFileChanges: false },
      );
    },
    [cwd, id, task?.parentId, jwt],
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          onClick={cwd ? openTask : undefined}
          className={cn(
            "mx-px rounded-sm border border-border box-decoration-clone p-0.5 text-sm/6",
            cwd &&
              "cursor-pointer hover:bg-zinc-200 active:bg-zinc-200 dark:active:bg-zinc-700 dark:hover:bg-zinc-700",
            className,
          )}
        >
          <MessageSquare className="mr-0.5 inline size-3.5 align-text-bottom" />
          <span className="ml-0.5 break-words">{displayTitle}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-[200px]">{displayTitle}</p>
      </TooltipContent>
    </Tooltip>
  );
}
