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

export interface SettingsState {
  selectedModelId: string | undefined;
  autoApproveActive: boolean;
  autoApproveSettings: AutoApprove;

  isDevMode: boolean;

  enablePochiModels: boolean;
  enableSync: boolean;

  updateAutoApproveSettings: (data: Partial<AutoApprove>) => void;
  updateSelectedModelId: (selectedModelId: string | undefined) => void;
  updateAutoApproveActive: (value: boolean) => void;
  updateIsDevMode: (value: boolean) => void;

  updateEnablePochiModels: (value: boolean) => void;
  updateEnableSync: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      selectedModelId: undefined,
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
      enableSync: false,

      enableVSCodeLm: false,

      updateSelectedModelId: (selectedModelId: string | undefined) =>
        set({ selectedModelId }),

      updateAutoApproveSettings: (data) =>
        set((state) => ({
          autoApproveSettings: { ...state.autoApproveSettings, ...data },
        })),

      updateAutoApproveActive: (value: boolean) =>
        set(() => ({ autoApproveActive: value })),

      updateIsDevMode: (value: boolean) => set(() => ({ isDevMode: value })),

      updateEnablePochiModels: (value: boolean) =>
        set(() => ({ enablePochiModels: value })),

      updateEnableSync: (value: boolean) => set(() => ({ enableSync: value })),
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
