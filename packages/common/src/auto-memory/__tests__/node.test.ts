import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  AutoMemoryMaxManifestEntries,
  AutoMemoryLockName,
  AutoMemoryProjectInfoName,
} from "../../base";
import { AutoMemoryManager, sanitizeMemoryRepoKey } from "../node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("long-term memory helpers", () => {
  it("creates stable filesystem-safe repo keys from the project basename", () => {
    const key = sanitizeMemoryRepoKey("/Users/test/project repo");

    expect(key).toMatch(/^[A-Za-z0-9._-]+-[a-f0-9]{10}$/);
    expect(key.startsWith("project-repo-")).toBe(true);
    expect(key.includes("Users")).toBe(false);
  });

  it("disambiguates same-basename repos via the hash suffix", () => {
    const a = sanitizeMemoryRepoKey("/Users/me/work/pochi");
    const b = sanitizeMemoryRepoKey("/Users/me/oss/pochi");

    expect(a.startsWith("pochi-")).toBe(true);
    expect(b.startsWith("pochi-")).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe("AutoMemoryManager Dream sources and thresholds", () => {
  let projectsRoot: string;
  let cwd: string;
  const now = Date.UTC(2026, 8, 23, 12);
  const day = 24 * 60 * 60 * 1_000;

  beforeEach(async () => {
    projectsRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "pochi-dream-projects-"),
    );
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "pochi-dream-repo-"));
    vi.spyOn(Date, "now").mockReturnValue(now);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(projectsRoot, { recursive: true, force: true });
    await fs.rm(cwd, { recursive: true, force: true });
  });

  async function prepare(lastDreamAt: number, sessions: number) {
    const manager = new AutoMemoryManager({ projectsRoot });
    const context = (await manager.readContext(cwd))!;
    const lockPath = path.join(context.memoryDir, AutoMemoryLockName);
    await fs.writeFile(lockPath, JSON.stringify({ status: "idle" }));
    await fs.utimes(lockPath, lastDreamAt / 1_000, lastDreamAt / 1_000);
    for (const taskId of [
      "parent",
      ...Array.from({ length: sessions }, (_, i) => `other-${i}`),
    ]) {
      await manager.writeTaskTranscript({
        taskId,
        cwd,
        title: `Session ${taskId}`,
        updatedAt: now,
        transcript: "### 1. user\nA durable project preference.\n",
      });
    }
    return { manager, context };
  }

  it.each([
    { elapsed: day - 1, sessions: 5, starts: false },
    { elapsed: day, sessions: 4, starts: false },
    { elapsed: day, sessions: 5, starts: true },
    { elapsed: day * 2, sessions: 0, starts: false },
  ])(
    "requires both gates: elapsed=$elapsed, other sessions=$sessions",
    async ({ elapsed, sessions, starts }) => {
      const { manager } = await prepare(now - elapsed, sessions);
      const run = await manager.beginDreamRun({ cwd, currentTaskId: "parent" });
      expect(Boolean(run)).toBe(starts);
      if (starts) {
        expect(run?.sessionCount).toBe(5);
        expect(run?.candidates).toHaveLength(5);
        expect(
          run?.candidates.some((candidate) => candidate.taskId === "parent"),
        ).toBe(false);
      }
    },
  );

  it("discovers existing sources across manager instances and ignores missing, invalid and duplicate sessions", async () => {
    const { context } = await prepare(now - day, 5);
    await fs.rename(
      path.join(context.transcriptDir, "other-0.md"),
      path.join(context.transcriptDir, "actual-source-name.md"),
    );
    await fs.copyFile(
      path.join(context.transcriptDir, "other-1.md"),
      path.join(context.transcriptDir, "duplicate.md"),
    );
    await fs.writeFile(
      path.join(context.transcriptDir, "invalid.md"),
      "No metadata\n",
    );
    await fs.writeFile(
      path.join(context.transcriptDir, "invalid-date.md"),
      "---\ntaskId: invalid\nupdatedAt: invalid\n---\n",
    );
    await fs.mkdir(path.join(context.transcriptDir, "directory.md"));
    const manager = new AutoMemoryManager({ projectsRoot });
    const run = await manager.beginDreamRun({ cwd, currentTaskId: "parent" });
    expect(run?.sessionCount).toBe(5);
    expect(
      run?.candidates.find((candidate) => candidate.taskId === "other-0"),
    ).toMatchObject({
      transcriptFilename: "actual-source-name.md",
      title: "Session other-0",
      cwd,
      updatedAt: now,
    });
    await manager.finishDreamRun({
      ...run!,
      success: false,
      memoryDir: context.memoryDir,
    });
    await fs.rm(path.join(context.transcriptDir, "actual-source-name.md"));
    expect(
      await manager.beginDreamRun({ cwd, currentTaskId: "parent" }),
    ).toBeUndefined();
  });

  it("counts only sessions updated since the previous Dream and holds the lock until completion", async () => {
    const { manager, context } = await prepare(now - day, 5);
    await manager.writeTaskTranscript({
      taskId: "old",
      cwd,
      updatedAt: now - day,
      transcript: "Old session",
    });
    const run = await manager.beginDreamRun({ cwd, currentTaskId: "parent" });
    expect(run?.candidates).toHaveLength(5);
    const otherManager = new AutoMemoryManager({ projectsRoot });
    expect(
      await otherManager.beginDreamRun({ cwd, currentTaskId: "parent" }),
    ).toBeUndefined();
    await manager.finishDreamRun({
      ...run!,
      success: true,
      memoryDir: context.memoryDir,
    });
    expect(
      await otherManager.beginDreamRun({ cwd, currentTaskId: "parent" }),
    ).toBeUndefined();
  });

  it("initializes the first Dream interval without immediately running", async () => {
    const { manager, context } = await prepare(now - day, 5);
    await fs.rm(path.join(context.memoryDir, AutoMemoryLockName));
    expect(
      await manager.beginDreamRun({ cwd, currentTaskId: "parent" }),
    ).toBeUndefined();
  });
});

describe("AutoMemoryManager project info file", () => {
  let projectsRoot: string;
  let cwd: string;
  let worktreeCwd: string;

  beforeEach(async () => {
    projectsRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "pochi-auto-memory-projects-"),
    );
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "pochi-auto-memory-repo-"));
    worktreeCwd = await fs.mkdtemp(
      path.join(os.tmpdir(), "pochi-auto-memory-worktree-"),
    );
  });

  afterEach(async () => {
    await fs.rm(projectsRoot, { recursive: true, force: true });
    await fs.rm(cwd, { recursive: true, force: true });
    await fs.rm(worktreeCwd, { recursive: true, force: true });
  });

  it("writes project.json mapping the repoKey back to the source repo path", async () => {
    const manager = new AutoMemoryManager({ projectsRoot });
    const context = await manager.readContext(cwd);
    expect(context).toBeDefined();

    const infoPath = path.join(
      projectsRoot,
      context?.repoKey ?? "",
      AutoMemoryProjectInfoName,
    );
    const info = JSON.parse(await fs.readFile(infoPath, "utf8"));
    expect(info).toEqual({
      repoKey: context?.repoKey,
      repoPath: path.resolve(cwd),
    });
  });

  it("skips rewriting project.json when the mapping is unchanged", async () => {
    const manager = new AutoMemoryManager({ projectsRoot });
    const first = await manager.readContext(cwd);
    expect(first).toBeDefined();
    const infoPath = path.join(
      projectsRoot,
      first?.repoKey ?? "",
      AutoMemoryProjectInfoName,
    );
    const firstStat = await fs.stat(infoPath);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await manager.readContext(cwd);
    const secondStat = await fs.stat(infoPath);
    expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
  });

  it("generates MEMORY.md from topic frontmatter", async () => {
    const manager = new AutoMemoryManager({ projectsRoot });
    const first = await manager.readContext(cwd);
    if (!first) throw new Error("expected a memory context");

    expect(await fs.readFile(first.indexPath, "utf8")).toContain(
      "No topic files yet.",
    );

    await fs.writeFile(
      path.join(first.memoryDir, "conventions.md"),
      `---\nname: Project conventions\ndescription: Coding conventions.\ntype: project\n---\n\nbody\n`,
    );

    const second = await manager.readContext(cwd);
    const index = await fs.readFile(first.indexPath, "utf8");
    expect(index).toContain("## project");
    expect(index).toContain(
      "- conventions.md (Project conventions): Coding conventions.",
    );
    // The in-prompt snapshot is the generated content, not a stale file read.
    expect(second?.indexContent).toContain("conventions.md");
    expect(second?.manifest[0]).toMatchObject({
      filename: "conventions.md",
      type: "project",
    });
  });

  it("leaves MEMORY.md untouched when the generated index is unchanged", async () => {
    const manager = new AutoMemoryManager({ projectsRoot });
    const context = await manager.readContext(cwd);
    if (!context) throw new Error("expected a memory context");
    const firstStat = await fs.stat(context.indexPath);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await manager.readContext(cwd);

    const secondStat = await fs.stat(context.indexPath);
    expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
  });

  it("keeps every flat topic in MEMORY.md beyond the prompt manifest limit", async () => {
    const manager = new AutoMemoryManager({ projectsRoot });
    const context = (await manager.readContext(cwd))!;
    const oldestTopic = path.join(context.memoryDir, "oldest.md");
    await fs.writeFile(
      oldestTopic,
      "---\nname: Oldest\ndescription: Durable convention.\ntype: project\n---\n",
    );
    await fs.utimes(oldestTopic, 1, 1);
    await Promise.all(
      Array.from({ length: AutoMemoryMaxManifestEntries }, (_, index) =>
        fs.writeFile(
          path.join(context.memoryDir, `topic-${index}.md`),
          "---\nname: Topic\ntype: project\n---\n",
        ),
      ),
    );

    const next = (await manager.readContext(cwd))!;
    const index = await fs.readFile(context.indexPath, "utf8");
    expect(index).toContain("- oldest.md (Oldest): Durable convention.");
    expect(
      index.split("\n").filter((line) => line.startsWith("- ")),
    ).toHaveLength(AutoMemoryMaxManifestEntries + 1);
    expect(next.manifest).toHaveLength(AutoMemoryMaxManifestEntries + 1);
    expect(next.indexTruncated).toBe(true);
  });

  it.each([
    ["folded", "description: >-\n  Required project\n  conventions."],
    ["literal", "description: |\n  Required project\n  conventions."],
    ["quoted", 'description: "Required project\\nconventions."'],
    [
      "long header",
      `${"# comment\n".repeat(30)}description: Required project conventions.`,
    ],
  ])(
    "parses %s YAML descriptions and normalizes index entries",
    async (_name, description) => {
      const manager = new AutoMemoryManager({ projectsRoot });
      const context = (await manager.readContext(cwd))!;
      await fs.writeFile(
        path.join(context.memoryDir, "conventions.md"),
        `---\nname: |\n  Project\n  conventions\n${description}\ntype: project\n---\nBody\n`,
      );

      const next = (await manager.readContext(cwd))!;
      expect(next.manifest[0]).toMatchObject({
        name: "Project conventions",
        description: "Required project conventions.",
        type: "project",
      });
      expect(next.indexContent).toContain(
        "- conventions.md (Project conventions): Required project conventions.",
      );
      expect(await fs.readFile(context.indexPath, "utf8")).toContain(
        "- conventions.md (Project conventions): Required project conventions.",
      );
    },
  );

  it.each([
    "name: [unterminated",
    "name: 42\ndescription: [unexpected, array]\ntype: unknown",
    "name: null\ndescription: false\ntype: []",
  ])(
    "keeps topics with invalid frontmatter discoverable: %s",
    async (frontmatter) => {
      const manager = new AutoMemoryManager({ projectsRoot });
      const context = (await manager.readContext(cwd))!;
      await fs.writeFile(
        path.join(context.memoryDir, "invalid.md"),
        `---\n${frontmatter}\n---\nBody\n`,
      );

      const next = (await manager.readContext(cwd))!;
      expect(next.manifest).toHaveLength(1);
      expect(next.manifest[0]).toMatchObject({ filename: "invalid.md" });
      expect(next.manifest[0].name).toBeUndefined();
      expect(next.manifest[0].description).toBeUndefined();
      expect(next.indexContent).toContain("- invalid.md (invalid.md)");
    },
  );

  it("uses the main worktree path for git worktree memory keys", async () => {
    const worktreeGitDir = path.join(cwd, ".git", "worktrees", "feature");
    await fs.mkdir(worktreeGitDir, { recursive: true });
    await fs.writeFile(
      path.join(worktreeCwd, ".git"),
      `gitdir: ${worktreeGitDir}\n`,
    );

    const manager = new AutoMemoryManager({ projectsRoot });
    const context = await manager.readContext(worktreeCwd);
    expect(context?.repoKey).toBe(sanitizeMemoryRepoKey(cwd));

    const infoPath = path.join(
      projectsRoot,
      context?.repoKey ?? "",
      AutoMemoryProjectInfoName,
    );
    const info = JSON.parse(await fs.readFile(infoPath, "utf8"));
    expect(info.repoPath).toBe(path.resolve(cwd));
  });
});
