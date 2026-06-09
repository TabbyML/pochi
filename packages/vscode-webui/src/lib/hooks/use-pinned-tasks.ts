import { useTasks } from "../use-tasks";
import { useTaskArchived } from "./use-task-archived";
import { useTaskPinned } from "./use-task-pinned";

/**
 * Returns all pinned tasks across all cwds (excluding archived), sorted by
 * updatedAt descending.
 */
export function usePinnedTasks() {
  const { isTaskPinned } = useTaskPinned();
  const { isTaskArchived } = useTaskArchived();

  return useTasks()
    .filter(
      (t) =>
        t.parentId === null &&
        !!t.title?.trim() &&
        isTaskPinned(t.id) &&
        !isTaskArchived(t.id),
    )
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
