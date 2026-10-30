import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoMemoryManager, removeTaskTranscripts } from "../../auto-memory/node";
import { TaskIndexName } from "../../base";
import { type TaskTranscriptSource, syncTaskIndex } from "../node";

describe("task index", () => {
  let projectsRoot: string;
  let cwd: string;
  let manager: AutoMemoryManager;

  beforeEach(async () => {
    projectsRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "pochi-task-index-projects-"),
    );
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "pochi-task-index-repo-"));
    manager = new AutoMemoryManager({ projectsRoot });
  });

  afterEach(async () => {
    await fs.rm(projectsRoot, { recursive: true, force: true });
    await fs.rm(cwd, { recursive: true, force: true });
  });

  function writeTranscript(taskId: string, updatedAt: number) {
    return manager.writeTaskTranscript({
      taskId,
      cwd,
      title: `Title ${taskId}`,
      status: "completed",
      updatedAt,
      transcript: "### 1. user\nhello\n",
    });
  }

  async function indexedFiles(transcriptDir: string) {
    const index = await fs.readFile(
      path.join(transcriptDir, TaskIndexName),
      "utf8",
    );
    return index
      .split("\n")
      .filter((line) => line.includes(".md |"))
      .map((line) => line.split(" | ")[1]);
  }

  it("indexes the transcripts of the repository, most recently updated first", async () => {
    await writeTranscript("old", 1_000);
    const written = await writeTranscript("new", 2_000);

    const context = await syncTaskIndex(manager, cwd);
    expect(context).toStrictEqual({
      indexPath: path.join(written!.transcriptDir, TaskIndexName),
      transcriptDir: written!.transcriptDir,
    });
    expect(await indexedFiles(written!.transcriptDir)).toEqual([
      "new.md",
      "old.md",
    ]);
    expect(await fs.readFile(context!.indexPath, "utf8")).toContain(
      "| new.md | Title new",
    );
  });

  it("creates an empty index without touching the memory directory", async () => {
    const context = await syncTaskIndex(manager, cwd);
    expect(await fs.readFile(context!.indexPath, "utf8")).toContain(
      "(No task transcripts yet.)",
    );
    const projectRoot = path.dirname(context!.transcriptDir);
    expect(await fs.readdir(projectRoot)).toEqual(["transcripts"]);
    expect(await syncTaskIndex(manager, undefined)).toBe(undefined);
  });

  it("follows later turns and removals, and stays out of the transcript listing", async () => {
    await writeTranscript("first", 1_000);
    const written = await writeTranscript("second", 2_000);
    await syncTaskIndex(manager, cwd);
    await writeTranscript("first", 3_000);
    await syncTaskIndex(manager, cwd);

    expect(await indexedFiles(written!.transcriptDir)).toEqual([
      "first.md",
      "second.md",
    ]);
    expect(
      (await manager.listTranscripts({ cwd })).map((entry) => entry.taskId),
    ).toEqual(["first", "second"]);

    await removeTaskTranscripts(["second"], { projectsRoot });
    await syncTaskIndex(manager, cwd);
    expect(await indexedFiles(written!.transcriptDir)).toEqual(["first.md"]);
    expect(
      (await fs.readdir(written!.transcriptDir)).filter((name) =>
        name.endsWith(".tmp"),
      ),
    ).toEqual([]);
  });

  it("recovers when another process overwrites the index with a stale listing", async () => {
    // Fresh module instances have their own sync queue, like separate processes.
    vi.resetModules();
    const processA = await import("../node");
    vi.resetModules();
    const processB = await import("../node");

    const written = await writeTranscript("old", 1_000);
    let releaseStaleListing = () => {};
    const staleListingHeld = new Promise<void>((resolve) => {
      releaseStaleListing = resolve;
    });
    let listingTaken = () => {};
    const staleListingTaken = new Promise<void>((resolve) => {
      listingTaken = resolve;
    });
    let calls = 0;
    const slowSource: TaskTranscriptSource = {
      readContext: (...args) => manager.readContext(...args),
      listTranscripts: async (options) => {
        const transcripts = await manager.listTranscripts(options);
        if (calls++ === 0) {
          listingTaken();
          await staleListingHeld;
        }
        return transcripts;
      },
    };

    const syncA = processA.syncTaskIndex(slowSource, cwd);
    await staleListingTaken;
    await writeTranscript("new", 2_000);
    await processB.syncTaskIndex(manager, cwd);
    releaseStaleListing();
    await syncA;

    expect(await indexedFiles(written!.transcriptDir)).toEqual([
      "new.md",
      "old.md",
    ]);
  });

  it("serializes concurrent syncs so the index ends up complete", async () => {
    const contexts = await Promise.all(
      Array.from({ length: 5 }, async (_, i) => {
        await writeTranscript(`task-${i}`, 1_000 + i);
        return syncTaskIndex(manager, cwd);
      }),
    );
    expect(await indexedFiles(contexts[0]!.transcriptDir)).toEqual([
      "task-4.md",
      "task-3.md",
      "task-2.md",
      "task-1.md",
      "task-0.md",
    ]);
  });
});
