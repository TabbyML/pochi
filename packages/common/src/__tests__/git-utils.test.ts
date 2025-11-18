import { describe, expect, test } from "vitest";
import {
  getWorktreeNameFromGitDir,
  getWorktreeNameFromWorktreePath,
  parseGitOriginUrl,
} from "../git-utils";

describe("git-utils", () => {
  describe("getWorktreeNameFromGitDir", () => {
    test("should extract worktree name from git worktree path", () => {
      const gitDir = "/path/to/repo/.git/worktrees/feature-branch";
      const result = getWorktreeNameFromGitDir(gitDir);
      
      expect(result).toBe("feature-branch");
    });

    test("should handle worktree paths with multiple slashes", () => {
      const gitDir = "/Users/user/projects/repo/.git/worktrees/my-worktree";
      const result = getWorktreeNameFromGitDir(gitDir);
      
      expect(result).toBe("my-worktree");
    });

    test("should return 'main' for non-worktree git directories", () => {
      const gitDir = "/path/to/repo/.git";
      const result = getWorktreeNameFromGitDir(gitDir);
      
      expect(result).toBe("main");
    });

    test("should return 'main' for invalid worktree paths", () => {
      const gitDir = "/path/to/repo/.git/some/other/path";
      const result = getWorktreeNameFromGitDir(gitDir);
      
      expect(result).toBe("main");
    });

    test("should return undefined for undefined input", () => {
      const result = getWorktreeNameFromGitDir(undefined);
      
      expect(result).toBeUndefined();
    });

    test("should return undefined for empty string", () => {
      const result = getWorktreeNameFromGitDir("");
      
      expect(result).toBeUndefined();
    });
  });

  describe("getWorktreeNameFromWorktreePath", () => {
    test("should extract worktree name from path with forward slashes", () => {
      const path = "/path/to/worktrees/feature-branch";
      const result = getWorktreeNameFromWorktreePath(path);
      
      expect(result).toBe("feature-branch");
    });

    test("should extract worktree name from path with backslashes", () => {
      const path = "C:\\path\\to\\worktrees\\feature-branch";
      const result = getWorktreeNameFromWorktreePath(path);
      
      expect(result).toBe("feature-branch");
    });

    test("should return undefined for null input", () => {
      const result = getWorktreeNameFromWorktreePath(null);
      
      expect(result).toBeUndefined();
    });

    test("should return undefined for undefined input", () => {
      const result = getWorktreeNameFromWorktreePath(undefined);
      
      expect(result).toBeUndefined();
    });

    test("should handle path with no slashes", () => {
      const path = "worktree-name";
      const result = getWorktreeNameFromWorktreePath(path);
      
      expect(result).toBe("worktree-name");
    });
  });

  describe("parseGitOriginUrl", () => {
    test("should parse GitHub HTTPS URLs", () => {
      const url = "https://github.com/TabbyML/tabby";
      const result = parseGitOriginUrl(url);
      
      expect(result).toEqual({
        platform: "github",
        owner: "TabbyML",
        repo: "tabby",
        shorthand: "TabbyML/tabby",
        webUrl: "https://github.com/TabbyML/tabby",
      });
    });

    test("should parse GitHub SSH URLs", () => {
      const url = "git@github.com:TabbyML/tabby.git";
      const result = parseGitOriginUrl(url);
      
      expect(result).toEqual({
        platform: "github",
        owner: "TabbyML",
        repo: "tabby",
        shorthand: "TabbyML/tabby",
        webUrl: "https://github.com/TabbyML/tabby",
      });
    });

    test("should parse GitHub URLs with .git suffix", () => {
      const url = "https://github.com/TabbyML/tabby.git";
      const result = parseGitOriginUrl(url);
      
      expect(result).toEqual({
        platform: "github",
        owner: "TabbyML",
        repo: "tabby",
        shorthand: "TabbyML/tabby",
        webUrl: "https://github.com/TabbyML/tabby",
      });
    });

    test("should parse GitLab HTTPS URLs", () => {
      const url = "https://gitlab.com/user/project";
      const result = parseGitOriginUrl(url);
      
      expect(result).toEqual({
        platform: "gitlab",
        owner: "user",
        repo: "project",
        shorthand: "user/project",
        webUrl: "https://gitlab.com/user/project",
      });
    });

    test("should parse GitLab SSH URLs", () => {
      const url = "git@gitlab.com:user/project.git";
      const result = parseGitOriginUrl(url);
      
      expect(result).toEqual({
        platform: "gitlab",
        owner: "user",
        repo: "project",
        shorthand: "user/project",
        webUrl: "https://gitlab.com/user/project",
      });
    });

    test("should parse Bitbucket HTTPS URLs", () => {
      const url = "https://bitbucket.org/user/project";
      const result = parseGitOriginUrl(url);
      
      expect(result).toEqual({
        platform: "bitbucket",
        owner: "user",
        repo: "project",
        shorthand: "user/project",
        webUrl: "https://bitbucket.org/user/project",
      });
    });

    test("should parse Bitbucket SSH URLs", () => {
      const url = "git@bitbucket.org:user/project.git";
      const result = parseGitOriginUrl(url);
      
      expect(result).toEqual({
        platform: "bitbucket",
        owner: "user",
        repo: "project",
        shorthand: "user/project",
        webUrl: "https://bitbucket.org/user/project",
      });
    });

    test("should return null for unsupported URLs", () => {
      const urls = [
        "https://example.com/user/repo",
        "git@example.com:user/repo.git",
        "not-a-url",
        "",
      ];

      for (const url of urls) {
        expect(parseGitOriginUrl(url)).toBeNull();
      }
    });

    test("should return null for empty or null input", () => {
      expect(parseGitOriginUrl("")).toBeNull();
      expect(parseGitOriginUrl(null as any)).toBeNull();
      expect(parseGitOriginUrl(undefined as any)).toBeNull();
    });
  });
});