import { fileChangeEvent, vscodeHost } from "@/lib/vscode";
import { getLogger } from "@getpochi/common";
import {
  type TaskChangedFile,
  getChangedFileStoreKey,
} from "@getpochi/common/vscode-webui-bridge";
import type { Message } from "@getpochi/livekit";
import { useCallback, useEffect, useMemo } from "react";
import { create, useStore } from "zustand";
import {
  type StateStorage,
  createJSONStorage,
  persist,
} from "zustand/middleware";

const logger = getLogger("task-changed-files");

/**
 * Custom storage adapter for Zustand persist middleware that uses VS Code's
 * global state API instead of localStorage. This ensures state is shared
 * across all webviews (sidebar and task panels).
 */
const vscodeStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await vscodeHost.getGlobalState(name);
      logger.trace(`getItem: ${name}`, value ? "found" : "not found");
      return value ? JSON.stringify(value) : null;
    } catch (error) {
      logger.error(`Failed to get item: ${name}`, error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const parsed = JSON.parse(value);
      logger.trace(`setItem: ${name}`, parsed);
      await vscodeHost.setGlobalState(name, parsed);
    } catch (error) {
      logger.error(`Failed to set item: ${name}`, error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      logger.trace(`removeItem: ${name}`);
      await vscodeHost.setGlobalState(name, undefined);
    } catch (error) {
      logger.error(`Failed to remove item: ${name}`, error);
    }
  },
};

export type ChangedFileContent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "checkpoint";
      commit: string;
    }
  | null;

interface ChangedFileStore {
  changedFiles: TaskChangedFile[];
  updateChangedFiles: (files: string[], checkpoint: string) => Promise<void>;
  // when file is undefined, accept all changed files
  acceptChangedFile: (file: {
    filepath?: string;
    content: ChangedFileContent;
  }) => void;
  // when filepath is undefined, revert all changed files
  revertChangedFile: (filepath?: string) => Promise<void>;
  updateChangedFileContent: (filepath: string, content: string) => void;
}

const createChangedFileStore = (taskId: string) =>
  create(
    persist<ChangedFileStore>(
      (set, get) => {
        return {
          changedFiles: [],

          updateChangedFiles: async (files: string[], checkpoint: string) => {
            const changedFiles = get().changedFiles;
            const updatedChangedFiles = [...changedFiles];

            for (const filePath of files) {
              const currentFile = changedFiles.find(
                (f) => f.filepath === filePath,
              );

              // first time seeing this file change
              if (!currentFile) {
                updatedChangedFiles.push({
                  filepath: filePath,
                  added: 0,
                  removed: 0,
                  content: { type: "checkpoint", commit: checkpoint },
                  deleted: false,
                  state: "pending",
                });
              }

              const diffResult =
                await vscodeHost.diffChangedFiles(updatedChangedFiles);
              set({ changedFiles: diffResult });
            }
          },

          acceptChangedFile: (file: {
            filepath?: string;
            content: ChangedFileContent;
          }) => {
            set((state) => ({
              changedFiles: file.filepath
                ? state.changedFiles.map((f) =>
                    f.filepath === file.filepath
                      ? { ...f, state: "accepted", content: file.content }
                      : f,
                  )
                : state.changedFiles.map((f) => ({
                    ...f,
                    state: "accepted",
                    content: file.content,
                  })),
            }));
          },

          revertChangedFile: async (filepath?: string) => {
            const changedFiles = get().changedFiles;
            const targetFiles = filepath
              ? changedFiles.filter((f) => f.filepath === filepath)
              : changedFiles;

            await vscodeHost.restoreChangedFiles(targetFiles);
            set((state) => {
              return {
                changedFiles: filepath
                  ? state.changedFiles.map((f) =>
                      f.filepath === filepath ? { ...f, state: "reverted" } : f,
                    )
                  : state.changedFiles.map((f) => ({
                      ...f,
                      state: "reverted",
                    })),
              };
            });
          },

          updateChangedFileContent: (filepath: string, content: string) => {
            set((state) => ({
              changedFiles: state.changedFiles.map((f) =>
                f.filepath === filepath
                  ? {
                      ...f,
                      state: "userEdited",
                      content: { type: "text", text: content },
                    }
                  : f,
              ),
            }));
          },
        };
      },
      {
        name: getChangedFileStoreKey(taskId),
        storage: createJSONStorage(() => vscodeStorage),
      },
    ),
  );

const taskStores = new Map<string, ReturnType<typeof createChangedFileStore>>();

export const getTaskChangedFileStore = (taskId: string) => {
  if (taskStores.has(taskId)) {
    return taskStores.get(taskId) as ReturnType<typeof createChangedFileStore>;
  }

  const storeHook = createChangedFileStore(taskId);
  taskStores.set(taskId, storeHook);

  return storeHook;
};

export const useTaskChangedFiles = (
  taskId: string,
  messages: Message[],
  isExecuting?: boolean,
) => {
  const {
    changedFiles,
    acceptChangedFile: acceptChangedFileInternal,
    revertChangedFile,
    updateChangedFileContent,
  } = useStore(getTaskChangedFileStore(taskId));

  const visibleChangedFiles = useMemo(
    () => changedFiles.filter((f) => f.state === "pending"),
    [changedFiles],
  );

  const latestCheckpoint = useMemo(() => {
    return messages
      .flatMap((m) => m.parts.filter((p) => p.type === "data-checkpoint"))
      .map((p) => p.data.commit)
      .at(-1);
  }, [messages]);

  useEffect(() => {
    const unsubscribe = fileChangeEvent.on(
      "fileChanged",
      ({ filepath, content }) => {
        // exclude updates during task execution
        if (
          isExecuting === false &&
          changedFiles.some((cf) => cf.filepath === filepath)
        ) {
          updateChangedFileContent(filepath, content);
        }
      },
    );

    return () => unsubscribe();
  }, [changedFiles, updateChangedFileContent, isExecuting]);

  const showFileChanges = useCallback(
    async (filePath?: string) => {
      if (visibleChangedFiles.length === 0) {
        return;
      }
      await vscodeHost.showChangedFiles(
        filePath
          ? visibleChangedFiles.filter((f) => f.filepath === filePath)
          : visibleChangedFiles,
        filePath ? `Changes in ${filePath}` : "Changed Files",
      );
    },
    [visibleChangedFiles],
  );

  const revertFileChanges = useCallback(
    async (file?: string) => {
      await revertChangedFile(file);
    },
    [revertChangedFile],
  );

  const acceptChangedFile = useCallback(
    (filepath?: string) => {
      if (!latestCheckpoint) {
        return;
      }
      acceptChangedFileInternal({
        filepath,
        content: { type: "checkpoint", commit: latestCheckpoint },
      });
    },
    [latestCheckpoint, acceptChangedFileInternal],
  );

  return {
    changedFiles,
    visibleChangedFiles,
    showFileChanges,
    revertFileChanges,
    acceptChangedFile,
  };
};
