import { vscodeHost } from "@/lib/vscode";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import type { ToolsByPermission } from "@getpochi/tools";
import { create } from "zustand";
import {
  type StateStorage,
  createJSONStorage,
  persist,
} from "zustand/middleware";

export type AutoApprove = Record<
  Exclude<keyof typeof ToolsByPermission, "default">,
  boolean
> & {
  retry: boolean;
  maxRetryLimit: number;
  mcp: boolean;
};

export type SelectedModelInStore = Pick<DisplayModel, "id" | "name">;

export interface SettingsState {
  selectedModel: SelectedModelInStore | undefined;
  subtaskSelectedModel: SelectedModelInStore | undefined;

  subtaskOffhand: boolean;

  autoApproveActive: boolean;
  autoApproveSettings: AutoApprove;

  subtaskAutoApproveActive: boolean;
  subtaskAutoApproveSettings: AutoApprove;

  isDevMode: boolean;

  enablePochiModels: boolean;

  toggleSubtaskOffhand: () => void;
  updateAutoApproveSettings: (data: Partial<AutoApprove>) => void;
  updateSubtaskAutoApproveSettings: (data: Partial<AutoApprove>) => void;
  updateSelectedModel: (model: SelectedModelInStore | undefined) => void;
  updateSubtaskSelectedModel: (model: SelectedModelInStore | undefined) => void;
  updateAutoApproveActive: (value: boolean) => void;
  updateSubtaskAutoApproveActive: (value: boolean) => void;
  updateIsDevMode: (value: boolean) => void;

  updateEnablePochiModels: (value: boolean) => void;

  initSubtaskAutoApproveSettings: () => void;
}

const settingsStorageName = "ragdoll-settings-storage";

const excludeFields = [
  "autoApproveActive",
  "subtaskAutoApproveActive",
  "subtaskAutoApproveSettings",
];

export const GlobalStateStorage: StateStorage & {
  persist: (data: Partial<SettingsState>) => Promise<void>;
} = {
  async getItem(name) {
    const value = await vscodeHost.getGlobalState(name, null);
    return value as string | null;
  },

  async setItem(name: string, value: string | null) {
    if (globalThis.POCHI_WEBVIEW_KIND === "sidebar") {
      await vscodeHost.setGlobalState(name, value);
    }
  },

  async removeItem(name) {
    await vscodeHost.setGlobalState(name, null);
  },

  async persist(data: Partial<SettingsState>) {
    try {
      const currentGlobalState = (await vscodeHost.getGlobalState(
        settingsStorageName,
      )) as string | null;
      if (!currentGlobalState) return;

      const currentData = JSON.parse(currentGlobalState);
      const nextStore = JSON.stringify({
        ...currentData,
        state: {
          ...currentData.state,
          ...data,
        },
      });
      await vscodeHost.setGlobalState(settingsStorageName, nextStore);
    } catch (e) {
      // ignore
    }
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      selectedModel: undefined,
      subtaskSelectedModel: undefined,
      subtaskOffhand: false,

      autoApproveActive: true,
      autoApproveSettings: {
        read: true,
        write: true,
        execute: true,
        retry: true,
        maxRetryLimit: 3,
        mcp: false,
        autoRunSubtask: true,
      },

      // subtask manual run specific auto-approve settings
      subtaskAutoApproveActive: false,
      subtaskAutoApproveSettings: {
        read: false,
        write: false,
        execute: false,
        retry: true,
        maxRetryLimit: 3,
        mcp: false,
        autoRunSubtask: false,
      },

      isDevMode: true,

      enablePochiModels: false,

      toggleSubtaskOffhand: () =>
        set((state) => ({
          subtaskOffhand: !state.subtaskOffhand,
        })),

      updateSelectedModel: (selectedModel: SelectedModelInStore | undefined) =>
        set({ selectedModel }),

      updateSubtaskSelectedModel: (
        subtaskSelectedModel: SelectedModelInStore | undefined,
      ) => set({ subtaskSelectedModel }),

      updateAutoApproveSettings: (data) =>
        set((state) => ({
          autoApproveSettings: { ...state.autoApproveSettings, ...data },
        })),

      updateSubtaskAutoApproveSettings: (data) =>
        set((state) => ({
          subtaskAutoApproveSettings: {
            ...state.subtaskAutoApproveSettings,
            ...data,
          },
        })),

      initSubtaskAutoApproveSettings: () =>
        set((state) => ({
          subtaskAutoApproveActive: state.autoApproveActive,
          subtaskAutoApproveSettings: {
            ...state.autoApproveSettings,
          },
        })),

      updateAutoApproveActive: (value: boolean) =>
        set(() => ({ autoApproveActive: value })),

      updateSubtaskAutoApproveActive: (value: boolean) =>
        set(() => ({ subtaskAutoApproveActive: value })),

      updateIsDevMode: (value: boolean) => set(() => ({ isDevMode: value })),

      updateEnablePochiModels: (value: boolean) =>
        set(() => ({ enablePochiModels: value })),
    }),
    {
      name: settingsStorageName,
      storage: createJSONStorage(() => GlobalStateStorage),
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(
            ([k, v]) => !excludeFields.includes(k) && typeof v !== "function",
          ),
        ),
      merge(persistedState, currentState) {
        return {
          ...currentState,
          ...(persistedState as object),
          autoApproveActive: true,
        };
      },
      version: 1,
      migrate: (persistedState: unknown) => {
        if (
          persistedState &&
          typeof persistedState === "object" &&
          persistedState !== null
        ) {
          const state = persistedState as {
            autoApproveSettings?: {
              retry?: number | boolean;
              maxRetryLimit?: number;
              [key: string]: unknown;
            };
            [key: string]: unknown;
          };

          // Migration: convert old retry (number) to new retry (boolean) + maxRetryLimit (number)
          if (
            state.autoApproveSettings &&
            typeof state.autoApproveSettings.retry === "number"
          ) {
            const oldRetryCount = state.autoApproveSettings.retry;
            state.autoApproveSettings.retry = oldRetryCount > 0;
            state.autoApproveSettings.maxRetryLimit =
              oldRetryCount > 0 ? oldRetryCount : 3;
          }

          // Ensure maxRetryLimit exists (required for type safety)
          if (
            state.autoApproveSettings &&
            state.autoApproveSettings.maxRetryLimit === undefined
          ) {
            state.autoApproveSettings.maxRetryLimit = 3;
          }
        }

        return persistedState;
      },
    },
  ),
);
