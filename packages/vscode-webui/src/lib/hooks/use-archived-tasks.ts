import { useTasks } from "../use-tasks";
import { useTaskArchived } from "./use-task-archived";

/**
 * Returns all archived tasks across all cwds, sorted by updatedAt descending.
 */
export function useArchivedTasks() {
  const { isTaskArchived } = useTaskArchived();

  return useTasks()
    .filter(
      (t) => t.parentId === null && !!t.title?.trim() && isTaskArchived(t.id),
    )
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
