import { getVSCodeApi } from "@/lib/vscode";
import { create, useStore } from "zustand";
import {
  type StateStorage,
  createJSONStorage,
  persist,
} from "zustand/middleware";

interface InputState {
  taskInputDraft: string;
  setTaskInputDraft: (taskInputDraft: string) => void;
}

const StateStorageName = "pochi-state-storage";

const VscodeStateStorage: StateStorage = {
  getItem: (name: string): string | null => {
    const api = getVSCodeApi();
    if (!api) return null;
    const state = api.getState() as Record<string, unknown> | undefined;
    return (state?.[name] as string) || null;
  },
  setItem: (name: string, value: string): void => {
    const api = getVSCodeApi();
    if (!api) return;
    const state = (api.getState() as Record<string, unknown>) || {};
    api.setState({ ...state, [name]: value });
  },
  removeItem: (name: string): void => {
    const api = getVSCodeApi();
    if (!api) return;
    const state = (api.getState() as Record<string, unknown>) || {};
    delete state[name];
    api.setState(state);
  },
};

const createInputStore = create<InputState>()(
  persist(
    (set) => ({
      taskInputDraft: "",
      setTaskInputDraft: (taskInputDraft) => set({ taskInputDraft }),
    }),
    {
      name: StateStorageName,
      storage: createJSONStorage(() => VscodeStateStorage),
    },
  ),
);

/**
 * Hook to persist task input draft content across page navigation
 * Uses VSCode's built-in state management API via Zustand store
 */
export function useTaskInputDraft() {
  const { taskInputDraft, setTaskInputDraft } = useStore(createInputStore);

  return {
    draft: taskInputDraft,
    setDraft: setTaskInputDraft,
    clearDraft: () => setTaskInputDraft(""),
  };
}
