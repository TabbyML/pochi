import { vscodeHost } from "@/lib/vscode";
import { getLogger } from "@getpochi/common";
import { create } from "zustand";
import {
  type StateStorage,
  createJSONStorage,
  persist,
} from "zustand/middleware";

const logger = getLogger("review-plan-tutorial-counter");

const vscodeStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await vscodeHost.getGlobalState(name);
      return value ? JSON.stringify(value) : null;
    } catch (error) {
      logger.error(`Failed to get item: ${name}`, error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const parsed = JSON.parse(value);
      await vscodeHost.setGlobalState(name, parsed);
    } catch (error) {
      logger.error(`Failed to set item: ${name}`, error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await vscodeHost.setGlobalState(name, undefined);
    } catch (error) {
      logger.error(`Failed to remove item: ${name}`, error);
    }
  },
};

interface ReviewPlanTutorialCounterStore {
  count: number;
  incrementCount: () => void;
  resetCount: () => void;
}

export const useReviewPlanTutorialCounter = create(
  persist<ReviewPlanTutorialCounterStore>(
    (set) => ({
      count: 0,
      incrementCount: () => set((state) => ({ count: state.count + 1 })),
      resetCount: () => set({ count: 0 }),
    }),
    {
      name: "review-plan-tutorial-counter",
      storage: createJSONStorage(() => vscodeStorage),
    },
  ),
);
