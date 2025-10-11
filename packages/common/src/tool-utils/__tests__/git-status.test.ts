import { afterEach, describe, expect, it, vi } from "vitest";
import { GitStatusReader } from "../git-status";

const execMocks = vi.hoisted(() => new Map<string, string>());

vi.mock("node:child_process", () => ({
  exec: vi.fn((command: string, _, callback) => {
    const cmd = command.replace(/^git /, "");
    if (execMocks.has(cmd)) {
      callback(null, { stdout: execMocks.get(cmd) });
    } else {
      callback(new Error(`Command not found: ${cmd}`), { stdout: "" });
    }
  }),
}));

describe("GitStatusReader", () => {
  afterEach(() => {
    execMocks.clear();
  });

  it("should correctly read and parse git status", async () => {
    execMocks.set("remote get-url origin", "git@github.com:user/repo.git");
    execMocks.set("rev-parse --abbrev-ref HEAD", "feature-branch");
    execMocks.set(
      "symbolic-ref refs/remotes/origin/HEAD --short",
      "origin/main",
    );
    execMocks.set("status --porcelain", " M file1.txt\n?? file2.txt");
    execMocks.set(
      'log -n 5 --pretty=format:"%h %s"',
      "abc1234 feat: new feature\ndef5678 fix: a bug",
    );
    execMocks.set("config user.name", "Test User");
    execMocks.set("config user.email", "test@example.com");
    execMocks.set("rev-parse --path-format=absolute --git-common-dir", "/test/repo/.git");
    execMocks.set("rev-parse --path-format=absolute --show-toplevel", "/test/repo");

    const reader = new GitStatusReader({ cwd: "/test/repo" });
    const status = await reader.readGitStatus();

    expect(status).toEqual({
      origin: "https://github.com/user/repo",
      currentBranch: "feature-branch",
      mainBranch: "main",
      status: "M file1.txt\n?? file2.txt",
      recentCommits: ["abc1234 feat: new feature", "def5678 fix: a bug"],
      userName: "Test User",
      userEmail: "test@example.com",
      gitRoot: "/test/repo",
      worktree: "/test/repo",
    });
  });

  it("should handle repositories with no main branch", async () => {
    execMocks.set("remote get-url origin", "git@github.com:user/repo.git");
    execMocks.set("rev-parse --abbrev-ref HEAD", "master");
    execMocks.set("symbolic-ref refs/remotes/origin/HEAD --short", "");
    execMocks.set("show-ref --verify --quiet refs/remotes/origin/main", "");
    execMocks.set("show-ref --verify --quiet refs/remotes/origin/master", "");
    execMocks.set("status --porcelain", "");
    execMocks.set('log -n 5 --pretty=format:"%h %s"', "");

    const reader = new GitStatusReader({ cwd: "/test/repo" });
    const status = await reader.readGitStatus();

    expect(status?.mainBranch).toBe("");
  });

  it("should sanitize origin URLs with credentials", async () => {
    execMocks.set(
      "remote get-url origin",
      "https://user:pass@github.com/user/repo.git",
    );
    const reader = new GitStatusReader({ cwd: "/test/repo" });
    const status = await reader.readGitStatus();
    expect(status?.origin).toBe("https://github.com/user/repo");
  });

  it("should return undefined when not in a git repository", async () => {
    execMocks.clear(); // No commands will be found
    const reader = new GitStatusReader({ cwd: "/not/a/repo" });
    const status = await reader.readGitStatus();
    expect(status?.origin).toBeUndefined();
  });
});
