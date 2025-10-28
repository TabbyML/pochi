import { exec } from "node:child_process";
import { promisify } from "node:util";
import { type GitStatus, getLogger } from "../base";
import { parseGitOriginUrl } from "../git-utils";

export interface GitStatusReaderOptions {
  cwd: string;
  webviewKind?: "sidebar" | "pane";
}

const logger = getLogger("GitStatus");

const execPromise = promisify(exec);

/**
 * Execute a git command and return the output
 * Returns empty string if command fails or repository not found
 */
const execGit = async (cwd: string, command: string): Promise<string> => {
  if (!cwd) {
    throw new Error("No working directory specified");
  }

  try {
    const { stdout } = await execPromise(`git ${command}`, {
      cwd,
    });
    return stdout.trim();
  } catch {
    return "";
  }
};

export class GitStatusReader {
  private readonly cwd: string;
  private readonly webviewKind: "sidebar" | "pane";

  constructor(options: GitStatusReaderOptions) {
    this.cwd = options.cwd;
    this.webviewKind = options.webviewKind ?? "pane";
  }

  private async execGit(command: string): Promise<string> {
    return execGit(this.cwd, command);
  }

  /**
   * Detect the main branch using multiple fallback strategies
   */
  private async detectMainBranch(): Promise<string> {
    /*
     * Fallback strategies to detect the main branch
     * 1. Check if HEAD is a symbolic ref to the main branch
     * 2. Check if the main branch exists in the remote
     * 3. Check if the master branch exists in the remote
     */
    const strategies = [
      () => this.execGit("symbolic-ref refs/remotes/origin/HEAD --short"),
      async () => {
        const output = await this.execGit(
          "show-ref --verify --quiet refs/remotes/origin/main",
        );
        return output ? "main" : "";
      },
      async () => {
        const output = await this.execGit(
          "show-ref --verify --quiet refs/remotes/origin/master",
        );
        return output ? "master" : "";
      },
    ];

    for (const strategy of strategies) {
      try {
        const result = await strategy();
        if (result) {
          return result.replace(/^origin\//, "").trim();
        }
      } catch {
        // skip to the next strategy
      }
    }
    return "";
  }

  /**
   * Check if URL is an SCP-like git URL with embedded credentials
   * e.g., user@password:TabbyML/tabby.git
   */
  private isScpLikeGitUrl(originUrl: string): boolean {
    return (
      originUrl.includes("@") &&
      originUrl.includes(":") &&
      !originUrl.startsWith("git@") &&
      !originUrl.startsWith("ssh://")
    );
  }

  /**
   * Sanitize git origin URL by removing credential information
   * Returns a clean URL safe for display in environment/prompts
   */
  private sanitizeOriginUrl(originUrl: string | undefined): string | undefined {
    if (!originUrl) return undefined;

    let cleanedUrl = originUrl;

    if (originUrl.startsWith("https://")) {
      const url = new URL(originUrl);
      url.username = "";
      url.password = "";
      cleanedUrl = url.toString();
    } else if (this.isScpLikeGitUrl(originUrl)) {
      const colonIndex = originUrl.lastIndexOf(":");
      if (colonIndex !== -1) {
        cleanedUrl = originUrl.substring(colonIndex + 1);
      }
    } else if (originUrl.startsWith("git@") || originUrl.startsWith("ssh://")) {
      cleanedUrl = originUrl;
    }

    const repoInfo = parseGitOriginUrl(cleanedUrl);
    if (repoInfo) {
      return repoInfo.webUrl;
    }

    return cleanedUrl;
  }

  /**
   * Implementation of git status collection
   * Collects all git data and returns it as structured data
   */
  private async readGitStatusImpl(): Promise<GitStatus> {
    const [
      rawOrigin,
      currentBranch,
      mainBranch,
      status,
      recentCommits,
      userName,
      userEmail,
      worktreeGitdir,
      worktreeDir,
    ] = await Promise.all([
      this.execGit("remote get-url origin").catch(() => undefined),
      this.execGit("rev-parse --abbrev-ref HEAD").catch(() => "unknown"),
      this.detectMainBranch().catch(() => "unknown"),
      this.execGit("status --porcelain").catch(() => ""),
      this.execGit('log -n 5 --pretty=format:"%h %s"')
        .then((x) => x.split("\n"))
        .catch(() => []),
      this.execGit("config user.name").catch(() => undefined),
      this.execGit("config user.email").catch(() => undefined),
      parseWorktreeGitdir(this.cwd),
      this.execGit("rev-parse --path-format=absolute --show-toplevel").catch(
        () => "",
      ),
    ]);

    const origin = this.sanitizeOriginUrl(rawOrigin);

    return {
      origin,
      currentBranch,
      mainBranch,
      status,
      recentCommits,
      userName,
      userEmail,
      worktree:
        this.webviewKind === "pane" &&
        this.cwd === worktreeDir &&
        worktreeGitdir
          ? { gitdir: worktreeGitdir }
          : undefined,
    };
  }

  /**
   * Get Git status information for the current repository as a formatted string
   */
  public async readGitStatus(): Promise<GitStatus | undefined> {
    if (!this.cwd) {
      logger.warn("No Git repository path specified");
      return undefined;
    }

    try {
      logger.trace("Reading Git status for repository", {
        path: this.cwd,
      });

      return await this.readGitStatusImpl();
    } catch (error) {
      logger.error("Error reading Git status", error);
      return undefined;
    }
  }
}

export async function parseWorktreeGitdir(
  cwd: string,
): Promise<string | undefined> {
  try {
    /**
     * for main worktree, gitdir is .git directory
     * for other worktrees, gitdir is stored in .git file as: `gitdir: /path/to/git/dir`, the real path is like `/path/to/repo/.git/worktrees/<worktree-name>`
     */
    const gitdir = await execGit(cwd, "rev-parse --absolute-git-dir");
    return gitdir;
  } catch (error) {
    return undefined;
  }
}
