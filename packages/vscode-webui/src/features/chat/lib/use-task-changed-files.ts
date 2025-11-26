import { fileChangeEvent, vscodeHost } from "@/lib/vscode";
import type { TaskChangedFile } from "@getpochi/common/vscode-webui-bridge";
import type { Message } from "@getpochi/livekit";
import { useCallback, useEffect, useMemo, useState } from "react";
import { create, useStore } from "zustand";
import { persist } from "zustand/middleware";

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
  setChangedFile: (changedFiles: TaskChangedFile[]) => void;
  // when file is undefined, accept all changed files
  acceptChangedFile: (file: {
    filepath?: string;
    content: ChangedFileContent;
  }) => void;
  // when filepath is undefined, revert all changed files
  revertChangedFile: (filepath?: string) => void;
  updateChangedFileContent: (filepath: string, content: string) => void;
}

const createChangedFileStore = (taskId: string) =>
  create(
    persist<ChangedFileStore>(
      (set) => {
        return {
          changedFiles: [],
          setChangedFile: (changedFiles: TaskChangedFile[]) => {
            set(() => ({ changedFiles }));
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

          revertChangedFile: (filepath?: string) => {
            set((state) => ({
              changedFiles: filepath
                ? state.changedFiles.map((f) =>
                    f.filepath === filepath ? { ...f, state: "reverted" } : f,
                  )
                : state.changedFiles.map((f) => ({ ...f, state: "reverted" })),
            }));
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
      { name: `changed-file-store-${taskId}` },
    ),
  );

const taskStores = new Map<string, ReturnType<typeof createChangedFileStore>>();
export const getTaskChangedFileStoreHook = (taskId: string) => {
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
  actionEnabled: boolean,
) => {
  const {
    changedFiles,
    acceptChangedFile: acceptChangedFileInternal,
    revertChangedFile,
    updateChangedFileContent,
  } = useStore(getTaskChangedFileStoreHook(taskId));
  const [checkpoints, setCheckpoints] = useState<string[]>([]);

  const visibleChangedFiles = useMemo(
    () => changedFiles.filter((f) => f.state === "pending"),
    [changedFiles],
  );

  useEffect(() => {
    const checkpoints = messages
      .flatMap((m) => m.parts.filter((p) => p.type === "data-checkpoint"))
      .map((p) => p.data.commit);
    setCheckpoints(checkpoints);
  }, [messages]);

  useEffect(() => {
    const unsubscribe = fileChangeEvent.on(
      "fileChanged",
      ({ filepath, content }) => {
        if (
          changedFiles.some((cf) => cf.filepath === filepath) &&
          actionEnabled
        ) {
          updateChangedFileContent(filepath, content);
        }
      },
    );

    return () => unsubscribe();
  }, [changedFiles, updateChangedFileContent, actionEnabled]);

  const showFileChanges = useCallback(
    async (filePath?: string) => {
      if (checkpoints.length < 2) {
        return;
      }
      await vscodeHost.showChangedFiles(
        filePath
          ? visibleChangedFiles.filter((f) => f.filepath === filePath)
          : visibleChangedFiles,
      );
    },
    [checkpoints, visibleChangedFiles],
  );

  const revertFileChanges = useCallback(
    async (file?: string) => {
      if (checkpoints.length < 1) {
        return;
      }
      const targetFiles = file
        ? changedFiles.filter((f) => f.filepath === file)
        : changedFiles;

      await vscodeHost.restoreChangedFiles(targetFiles);
      revertChangedFile(file);
    },
    [checkpoints, changedFiles, revertChangedFile],
  );

  const acceptChangedFile = useCallback(
    (filepath?: string) => {
      const latestCheckpoint = checkpoints.at(-1);
      if (!latestCheckpoint) {
        return;
      }
      acceptChangedFileInternal({
        filepath,
        content: { type: "checkpoint", commit: latestCheckpoint },
      });
    },
    [checkpoints, acceptChangedFileInternal],
  );

  return {
    changedFiles,
    visibleChangedFiles,
    showFileChanges,
    revertFileChanges,
    acceptChangedFile,
  };
};
