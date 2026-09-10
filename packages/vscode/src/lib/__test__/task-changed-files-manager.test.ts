import * as assert from "node:assert";
import * as path from "node:path";
import type { TaskChangedFile } from "@getpochi/common/vscode-webui-bridge";
import { describe, it } from "mocha";
import type { CheckpointService } from "../../integrations/checkpoint/checkpoint-service";
import type { TaskActivityTracker } from "../../integrations/editor/task-activity-tracker";
import type { TaskDataStore } from "../task-data-store";
import { TaskChangedFilesManager } from "../task-changed-files-manager";

const taskId = "task-1";
const checkpoint = "checkpoint-1";

function createChangedFile(filepath: string): TaskChangedFile {
  return {
    filepath,
    added: 1,
    removed: 0,
    content: { type: "checkpoint", commit: checkpoint },
    deleted: false,
    state: "pending",
  };
}

function createManager(currentFiles: TaskChangedFile[]) {
  let savedFiles: TaskChangedFile[] = [];
  const taskDataStore = {
    getChangedFiles: () => currentFiles,
    setChangedFiles: async (_taskId: string, files: TaskChangedFile[]) => {
      savedFiles = files;
    },
  } as unknown as TaskDataStore;
  const taskActivityTracker = {} as TaskActivityTracker;
  const checkpointService = {
    diffChangedFiles: async (files: TaskChangedFile[]) => files,
  } as CheckpointService;

  return {
    manager: new TaskChangedFilesManager(taskDataStore, taskActivityTracker),
    checkpointService,
    getSavedFiles: () => savedFiles,
  };
}

describe("TaskChangedFilesManager", () => {
  it("does not append a relative alias for an existing absolute path", async () => {
    const cwd = path.join(path.sep, "workspace", "project");
    const relativePath = path.join("packages", "vscode", "package.json");
    const absolutePath = path.join(cwd, relativePath);
    const { manager, checkpointService, getSavedFiles } = createManager([
      createChangedFile(absolutePath),
    ]);

    await manager.updateChangedFiles(
      taskId,
      [relativePath],
      checkpoint,
      checkpointService,
      cwd,
    );

    assert.deepStrictEqual(
      getSavedFiles().map((file) => file.filepath),
      [absolutePath],
    );
  });

  it("deduplicates aliases added in the same update without rewriting the first path", async () => {
    const cwd = path.join(path.sep, "workspace", "project");
    const relativePath = path.join("packages", "vscode", "package.json");
    const absolutePath = path.join(cwd, relativePath);
    const { manager, checkpointService, getSavedFiles } = createManager([]);

    await manager.updateChangedFiles(
      taskId,
      [absolutePath, relativePath],
      checkpoint,
      checkpointService,
      cwd,
    );

    assert.deepStrictEqual(
      getSavedFiles().map((file) => file.filepath),
      [absolutePath],
    );
  });

  it("leaves existing aliases unchanged", async () => {
    const cwd = path.join(path.sep, "workspace", "project");
    const relativePath = path.join("src", "index.ts");
    const firstFile = {
      ...createChangedFile(path.join(cwd, relativePath)),
      added: 3,
      state: "accepted" as const,
    };
    const laterAlias = {
      ...createChangedFile(relativePath),
      added: 7,
      content: { type: "text" as const, text: "later alias" },
    };
    const { manager, checkpointService, getSavedFiles } = createManager([
      firstFile,
      laterAlias,
    ]);

    await manager.updateChangedFiles(
      taskId,
      [],
      checkpoint,
      checkpointService,
      cwd,
    );

    assert.deepStrictEqual(getSavedFiles(), [firstFile, laterAlias]);
  });

  it("preserves raw strings for paths outside cwd", async () => {
    const cwd = path.join(path.sep, "workspace", "project");
    const absolutePath = path.join(path.sep, "workspace", "external", "file.ts");
    const relativePath = path.join("..", "external", "file.ts");
    const { manager, checkpointService, getSavedFiles } = createManager([
      createChangedFile(absolutePath),
    ]);

    await manager.updateChangedFiles(
      taskId,
      [relativePath],
      checkpoint,
      checkpointService,
      cwd,
    );

    assert.deepStrictEqual(
      getSavedFiles().map((file) => file.filepath),
      [absolutePath, relativePath],
    );
  });

  it("preserves raw strings when cwd is unavailable", async () => {
    const absolutePath = path.join(path.sep, "workspace", "project", "file.ts");
    const relativePath = "file.ts";
    const { manager, checkpointService, getSavedFiles } = createManager([
      createChangedFile(absolutePath),
    ]);

    await manager.updateChangedFiles(
      taskId,
      [relativePath],
      checkpoint,
      checkpointService,
      null,
    );

    assert.deepStrictEqual(
      getSavedFiles().map((file) => file.filepath),
      [absolutePath, relativePath],
    );
  });
});
