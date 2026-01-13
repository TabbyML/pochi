import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import type { BackgroundTaskEntry } from "@getpochi/common/vscode-webui-bridge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

const STORAGE_KEY = "backgroundTasks";
const QUERY_KEY = ["backgroundTasks"];
const MAX_BACKGROUND_TASKS = 100;

function normalizeBackgroundTasks(value: unknown): BackgroundTaskEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is BackgroundTaskEntry => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as Partial<BackgroundTaskEntry>;
      return (
        typeof candidate.uid === "string" &&
        typeof candidate.cwd === "string" &&
        typeof candidate.createdAt === "number"
      );
    })
    .map((entry) => ({
      uid: entry.uid,
      cwd: entry.cwd,
      parentId: entry.parentId,
      createdAt: entry.createdAt,
    }));
}

function mergeBackgroundTasks(
  ...lists: BackgroundTaskEntry[][]
): BackgroundTaskEntry[] {
  const map = new Map<string, BackgroundTaskEntry>();
  for (const list of lists) {
    for (const entry of list) {
      map.set(entry.uid, entry);
    }
  }
  return Array.from(map.values());
}

function sortAndCapBackgroundTasks(entries: BackgroundTaskEntry[]) {
  return [...entries]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_BACKGROUND_TASKS);
}

async function readBackgroundTasks() {
  if (!isVSCodeEnvironment()) {
    return [];
  }
  const stored = await vscodeHost.getWorkspaceState(STORAGE_KEY);
  return sortAndCapBackgroundTasks(normalizeBackgroundTasks(stored));
}

export const useBackgroundTasks = () => {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: readBackgroundTasks,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const addTask = useCallback(
    (entry: BackgroundTaskEntry) => {
      queryClient.setQueryData(QUERY_KEY, (prev) => {
        const existing = normalizeBackgroundTasks(prev);
        const next = sortAndCapBackgroundTasks(
          mergeBackgroundTasks(existing, [entry]),
        );
        return next;
      });
      if (isVSCodeEnvironment()) {
        void (async () => {
          const stored = await readBackgroundTasks();
          const cached = normalizeBackgroundTasks(
            queryClient.getQueryData(QUERY_KEY),
          );
          const next = sortAndCapBackgroundTasks(
            mergeBackgroundTasks(stored, cached, [entry]),
          );
          await vscodeHost.setWorkspaceState(STORAGE_KEY, next);
          queryClient.setQueryData(QUERY_KEY, next);
        })();
      }
    },
    [queryClient],
  );

  const removeTask = useCallback(
    (uid: string) => {
      queryClient.setQueryData(QUERY_KEY, (prev) => {
        const existing = normalizeBackgroundTasks(prev);
        const next = sortAndCapBackgroundTasks(
          existing.filter((task) => task.uid !== uid),
        );
        return next;
      });
      if (isVSCodeEnvironment()) {
        void (async () => {
          const stored = await readBackgroundTasks();
          const cached = normalizeBackgroundTasks(
            queryClient.getQueryData(QUERY_KEY),
          );
          const next = sortAndCapBackgroundTasks(
            mergeBackgroundTasks(stored, cached).filter(
              (task) => task.uid !== uid,
            ),
          );
          await vscodeHost.setWorkspaceState(STORAGE_KEY, next);
          queryClient.setQueryData(QUERY_KEY, next);
        })();
      }
    },
    [queryClient],
  );

  return {
    entries: data ?? [],
    addTask,
    removeTask,
  };
};
