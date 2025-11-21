import { create } from "zustand";

export interface TaskReadStatusState {
  unreadTaskIds: Set<string>;
  setTaskReadStatus: (taskId: string | string[], isRead: boolean) => void;
  getTaskReadStatus: (taskId: string) => boolean;
}

export const useTaskReadStatusStore = create<TaskReadStatusState>(
  (set, get) => ({
    unreadTaskIds: new Set(),

    setTaskReadStatus: (taskId: string | string[], isRead: boolean) => {
      set((state) => {
        const newSet = new Set(state.unreadTaskIds);
        const taskIds = Array.isArray(taskId) ? taskId : [taskId];

        for (const id of taskIds) {
          if (isRead) {
            // Remove from unread set when marked as read
            newSet.delete(id);
          } else {
            // Add to unread set when marked as unread
            newSet.add(id);
          }
        }

        return { unreadTaskIds: newSet };
      });
    },

    getTaskReadStatus: (taskId: string) => {
      // Default to true (read), returns false if in unread set
      return !get().unreadTaskIds.has(taskId);
    },
  }),
);
