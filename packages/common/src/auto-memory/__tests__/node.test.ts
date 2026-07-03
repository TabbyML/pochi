import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AutoMemoryProjectInfoName } from "../../base";
import { AutoMemoryManager, sanitizeMemoryRepoKey } from "../node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

describe("AutoMemoryManager project info file", () => {
  let projectsRoot: string;
  let cwd: string;
  let worktreeCwd: string;

  beforeEach(async () => {
    projectsRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "pochi-auto-memory-projects-"),
    );
    cwd = await fs.mkdtemp(
      path.join(os.tmpdir(), "pochi-auto-memory-repo-"),
    );
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
