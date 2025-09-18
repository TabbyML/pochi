import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import type { ToolsByPermission } from "@getpochi/tools";
import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  autoApproveActive: boolean;
  autoApproveSettings: AutoApprove;

  isDevMode: boolean;

  enablePochiModels: boolean;

  updateAutoApproveSettings: (data: Partial<AutoApprove>) => void;
  updateSelectedModel: (
    selectedModel: SelectedModelInStore | undefined,
  ) => void;
  updateAutoApproveActive: (value: boolean) => void;
  updateIsDevMode: (value: boolean) => void;

  updateEnablePochiModels: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      selectedModel: undefined,
      autoApproveActive: true,
      autoApproveSettings: {
        read: true,
        write: true,
        execute: true,
        retry: true,
        maxRetryLimit: 3,
        mcp: false,
      },
      isDevMode: false,

      enablePochiModels: false,

      updateSelectedModel: (selectedModel: SelectedModelInStore | undefined) =>
        set({ selectedModel }),

      updateAutoApproveSettings: (data) =>
        set((state) => ({
          autoApproveSettings: { ...state.autoApproveSettings, ...data },
        })),

      updateAutoApproveActive: (value: boolean) =>
        set(() => ({ autoApproveActive: value })),

      updateIsDevMode: (value: boolean) => set(() => ({ isDevMode: value })),

      updateEnablePochiModels: (value: boolean) =>
        set(() => ({ enablePochiModels: value })),
    }),
    {
      name: "ragdoll-settings-storage",
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(([_, v]) => typeof v !== "function"),
        ),
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
