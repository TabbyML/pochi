import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AutoMemoryManager,
  removeTaskTranscripts,
} from "../../auto-memory/node";
import * as transcripts from "../../auto-memory/transcripts";
import { TaskIndexName } from "../../base";
import { readTaskIndex, syncTaskIndex } from "../node";

describe("task index", () => {
  let projectsRoot: string;
  let cwd: string;
  let transcriptDir: string;
  let manager: AutoMemoryManager;

  beforeEach(async () => {
    projectsRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "pochi-task-index-projects-"),
    );
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "pochi-task-index-repo-"));
    manager = new AutoMemoryManager({ projectsRoot });
    transcriptDir = (await manager.resolveProjectPaths(cwd)).transcriptDir;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
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

  function indexPathOf(transcriptDir: string) {
    return path.join(path.dirname(transcriptDir), TaskIndexName);
  }

  async function indexedFiles(transcriptDir: string) {
    const index = await fs.readFile(indexPathOf(transcriptDir), "utf8");
    return index
      .split("\n")
      .filter((line) => line.includes(".md |"))
      .map((line) => line.split(" | ")[1]);
  }

  it("indexes the transcripts of the repository, most recently updated first", async () => {
    await writeTranscript("old", 1_000);
    const written = await writeTranscript("new", 2_000);

    const context = await readTaskIndex(manager, cwd);
    expect(context).toStrictEqual({
      indexPath: indexPathOf(written!.transcriptDir),
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
    const context = await readTaskIndex(manager, cwd);
    expect(await fs.readFile(context!.indexPath, "utf8")).toContain(
      "(No task transcripts yet.)",
    );
    const projectRoot = path.dirname(context!.transcriptDir);
    expect(await fs.readdir(projectRoot)).toEqual([TaskIndexName]);
    expect(await readTaskIndex(manager, undefined)).toBe(undefined);
  });

  it("follows later turns and removals, and stays out of the transcript listing", async () => {
    await writeTranscript("first", 1_000);
    const written = await writeTranscript("second", 2_000);
    await syncTaskIndex(transcriptDir);
    await writeTranscript("first", 3_000);
    await syncTaskIndex(transcriptDir);

    expect(await indexedFiles(written!.transcriptDir)).toEqual([
      "first.md",
      "second.md",
    ]);
    expect(
      (await manager.listTranscripts({ cwd })).map((entry) => entry.taskId),
    ).toEqual(["first", "second"]);

    await removeTaskTranscripts(["second"], { projectsRoot });
    expect(await indexedFiles(written!.transcriptDir)).toEqual(["first.md"]);
  });

  it("refreshes each affected project even if its worktree no longer exists", async () => {
    await writeTranscript("retired", 1_000);
    const otherCwd = path.join(cwd, "deleted-worktree");
    await fs.mkdir(otherCwd);
    const other = await manager.writeTaskTranscript({
      cwd: otherCwd,
      taskId: "retired",
      transcript: "another record",
    });
    const otherDir = other!.transcriptDir;
    expect(otherDir).not.toBe(transcriptDir);
    await Promise.all([syncTaskIndex(transcriptDir), syncTaskIndex(otherDir)]);
    await fs.rmdir(otherCwd);

    await removeTaskTranscripts(["retired", "missing"], { projectsRoot });
    for (const dir of [transcriptDir, otherDir]) {
      expect(await fs.readFile(indexPathOf(dir), "utf8")).toContain(
        "(No task transcripts yet.)",
      );
    }
  });

  it("publishes the remaining entries when a transcript disappears after readdir", async () => {
    const removed = await writeTranscript("expired", 1_000);
    await syncTaskIndex(transcriptDir);
    await writeTranscript("new", 2_000);

    const expiredPath = path.join(transcriptDir, removed!.filename);
    const open = fs.open.bind(fs);
    vi.spyOn(fs, "open").mockImplementation(async (file, ...args) => {
      if (file === expiredPath) await fs.unlink(expiredPath);
      return open(file, ...args);
    });

    await syncTaskIndex(transcriptDir);
    expect(await indexedFiles(transcriptDir)).toEqual(["new.md"]);
  });

  it("removes its temporary index when replacement fails and can retry", async () => {
    await writeTranscript("saved", 1_000);
    await syncTaskIndex(transcriptDir);
    const projectRoot = path.dirname(transcriptDir);
    await fs.writeFile(path.join(projectRoot, `${TaskIndexName}.other.tmp`), "in use");
    const before = (await fs.readdir(projectRoot)).sort();
    await writeTranscript("new", 2_000);
    vi.spyOn(fs, "rename").mockRejectedValueOnce(
      Object.assign(new Error("file in use"), { code: "EBUSY" }),
    );

    await syncTaskIndex(transcriptDir);
    expect(await indexedFiles(transcriptDir)).toEqual(["saved.md"]);
    expect((await fs.readdir(projectRoot)).sort()).toEqual(before);

    await syncTaskIndex(transcriptDir);
    expect(await indexedFiles(transcriptDir)).toEqual(["new.md", "saved.md"]);
  });

  it("preserves the last good index when the directory or a transcript cannot be read", async () => {
    await writeTranscript("saved", 1_000);
    await syncTaskIndex(transcriptDir);
    const indexPath = indexPathOf(transcriptDir);
    const original = await fs.readFile(indexPath, "utf8");
    await writeTranscript("new", 2_000);

    vi.spyOn(fs, "readdir").mockRejectedValueOnce(
      Object.assign(new Error("permission denied"), { code: "EACCES" }),
    );
    await syncTaskIndex(transcriptDir);
    expect(await fs.readFile(indexPath, "utf8")).toBe(original);

    vi.spyOn(fs, "open").mockRejectedValueOnce(new Error("read failed"));
    await syncTaskIndex(transcriptDir);
    expect(await fs.readFile(indexPath, "utf8")).toBe(original);

    await syncTaskIndex(transcriptDir);
    expect(await indexedFiles(transcriptDir)).toEqual(["new.md", "saved.md"]);
  });

  it("never overwrites a transcript whose task ID matches the index name", async () => {
    const taskId = TaskIndexName.replace(/\.md$/, "");
    const written = await writeTranscript(taskId, 1_000);
    const transcriptPath = path.join(written!.transcriptDir, written!.filename);

    await syncTaskIndex(transcriptDir);
    expect(await fs.readFile(transcriptPath, "utf8")).toContain("hello");
    expect(await indexedFiles(written!.transcriptDir)).toEqual([
      written!.filename,
    ]);
  });

  it("returns an existing index without waiting for the refresh", async () => {
    const written = await writeTranscript("old", 1_000);
    await syncTaskIndex(transcriptDir);
    await writeTranscript("new", 2_000);

    let releaseListing = () => {};
    const listingHeld = new Promise<void>((resolve) => {
      releaseListing = resolve;
    });
    const list = transcripts.listTranscriptCandidates;
    vi.spyOn(transcripts, "listTranscriptCandidates").mockImplementationOnce(
      async (...args) => {
        await listingHeld;
        return list(...args);
      },
    );
    const listDirectories = vi.spyOn(fs, "readdir");

    const context = await readTaskIndex(manager, cwd);
    expect(context?.indexPath).toBe(indexPathOf(written!.transcriptDir));
    expect(await indexedFiles(written!.transcriptDir)).toEqual(["old.md"]);

    releaseListing();
    // Queued after the background refresh, so it sees the refreshed index.
    await syncTaskIndex(transcriptDir);
    expect(await indexedFiles(written!.transcriptDir)).toEqual([
      "new.md",
      "old.md",
    ]);
    expect(listDirectories.mock.calls.map(([dir]) => dir)).not.toContain(
      path.join(path.dirname(transcriptDir), "memory"),
    );
  });

  it("points at no index when it could not be created", async () => {
    vi.spyOn(fs, "readdir").mockRejectedValueOnce(new Error("scan failed"));
    expect(await readTaskIndex(manager, cwd)).toBe(undefined);
    expect(await readTaskIndex(manager, cwd)).toBeDefined();
  });

  it("recovers when another process overwrites the index with a stale listing", async () => {
    // Fresh module instances have their own sync queue, like separate processes.
    vi.resetModules();
    const transcriptsA = await import("../../auto-memory/transcripts");
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
    const list = transcriptsA.listTranscriptCandidates;
    vi.spyOn(transcriptsA, "listTranscriptCandidates").mockImplementationOnce(
      async (...args) => {
        const stale = await list(...args);
        listingTaken();
        await staleListingHeld;
        return stale;
      },
    );

    const syncA = processA.syncTaskIndex(transcriptDir);
    await staleListingTaken;
    await writeTranscript("new", 2_000);
    await processB.syncTaskIndex(transcriptDir);
    releaseStaleListing();
    await syncA;

    expect(await indexedFiles(written!.transcriptDir)).toEqual([
      "new.md",
      "old.md",
    ]);
  }, 20_000);

  it("serializes concurrent syncs so the index ends up complete", async () => {
    await Promise.all(
      Array.from({ length: 5 }, async (_, i) => {
        await writeTranscript(`task-${i}`, 1_000 + i);
        return syncTaskIndex(transcriptDir);
      }),
    );
    expect(await indexedFiles(transcriptDir)).toEqual([
      "task-4.md",
      "task-3.md",
      "task-2.md",
      "task-1.md",
      "task-0.md",
    ]);
  }, 20_000);
});
