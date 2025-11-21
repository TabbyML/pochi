import { fileChangeEvent, vscodeHost } from "@/lib/vscode";
import type { Message } from "@getpochi/livekit";
import { useCallback, useEffect, useState } from "react";
import { useToolCallLifeCycle } from "./chat-state";
import { isToolUIPart } from "ai";

export interface TaskChangedFile {
  filepath: string;
  added: number;
  removed: number;
}

const useTaskChangedFilesState = () => {
  const [changedFiles, setChangedFiles] = useState<TaskChangedFile[]>([]);

  const addChangedFile = useCallback((fileDiff: TaskChangedFile) => {
    setChangedFiles((files) => [
      ...files.filter((f) => f.filepath !== fileDiff.filepath),
      fileDiff,
    ]);
  }, []);

  const removeChangedFile = useCallback((filepath?: string) => {
    if (filepath) {
      setChangedFiles((files) => files.filter((f) => f.filepath !== filepath));
    } else {
      setChangedFiles([]);
    }
  }, []);

  return {
    changedFiles,
    addChangedFile,
    removeChangedFile,
  };
};

function getToolPath(message: Message, toolCallId: string): string | null {
  if (message.role !== "assistant") {
    return null;
  }

  for (const part of message.parts) {
    if (
      isToolUIPart(part) &&
      part.toolCallId === toolCallId &&
      (part.type === "tool-applyDiff" ||
        part.type === "tool-multiApplyDiff" ||
        part.type === "tool-writeToFile") &&
      part.state === "input-available"
    ) {
      return part.input.path;
    }
  }

  return null;
}

export const useTaskChangedFiles = (messages: Message[]) => {
  const { changedFiles, addChangedFile, removeChangedFile } =
    useTaskChangedFilesState();
  const [checkpoints, setCheckpoints] = useState<string[]>([]);

  const { completeToolCalls } = useToolCallLifeCycle();

  useEffect(() => {
    const checkpoints = messages
      .flatMap((m) => m.parts.filter((p) => p.type === "data-checkpoint"))
      .map((p) => p.data.commit);
    setCheckpoints(checkpoints);
  }, [messages]);

  useEffect(() => {
    if (completeToolCalls.length === 0) return;
    const lastMessage = messages.at(messages.length - 1);
    if (!lastMessage) return;

    for (const toolCall of completeToolCalls) {
      if (toolCall.status !== "complete") continue;
      const path = getToolPath(lastMessage, toolCall.toolCallId);
      if (path) {
        addFile(path);
      }
    }
  }, [messages, completeToolCalls]);

  const addFile = useCallback(
    async (filepath: string) => {
      if (checkpoints.length < 1) {
        return;
      }

      await new Promise<void>((resolve) =>
        setTimeout(() => {
          resolve();
        }, 100),
      );

      const diffResult = await vscodeHost.diffWithCheckpoint(checkpoints[0], [
        filepath,
      ]);

      if (!diffResult || diffResult.length < 1) {
        return;
      }

      const fileDiff = diffResult[0];
      addChangedFile(fileDiff);
    },
    [checkpoints, addChangedFile],
  );

  useEffect(() => {
    const unsubscribe = fileChangeEvent.on("fileChanged", (filepath) => {
      if (changedFiles.some((cf) => cf.filepath === filepath)) {
        removeChangedFile(filepath);
      }
    });

    return () => unsubscribe();
  }, [changedFiles, removeChangedFile]);

  const showFileChanges = useCallback(
    async (filePath?: string) => {
      if (checkpoints.length < 2) {
        return;
      }
      await vscodeHost.showCheckpointDiff(
        "File Changes",
        {
          origin: checkpoints[0],
          modified: checkpoints.at(-1),
        },
        filePath ? [filePath] : changedFiles.map((f) => f.filepath),
      );
    },
    [checkpoints, changedFiles],
  );

  const revertFileChanges = useCallback(
    async (file?: string) => {
      if (checkpoints.length < 1) {
        return;
      }
      await vscodeHost.restoreCheckpoint(
        checkpoints[0],
        file ? [file] : changedFiles.map((f) => f.filepath),
      );
      removeChangedFile(file);
    },
    [checkpoints, changedFiles, removeChangedFile],
  );

  return { changedFiles, addFile, showFileChanges, revertFileChanges };
};
