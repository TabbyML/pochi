import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { constants, getLogger, toErrorMessage } from "@getpochi/common";
import { isFileExists } from "@getpochi/common/tool-utils";
import simpleGit, { type SimpleGit } from "simple-git";
import * as vscode from "vscode";
import type { FileChange } from "../editor/diff-changes-editor";
import { writeExcludesFile } from "./shadow-git-excludes";

const logger = getLogger("ShadowGitRepo");

/**
 * Skip the whole checkpoint when a new or modified file exceeds this size.
 * Existing, unchanged blobs can be reused without adding to disk usage.
 */
const MaxCheckpointFileSize = 100 * 1024 * 1024;

/** Unreachable objects younger than this survive a prune. */
const PruneGracePeriod = "1.hour.ago";

/** Inactivity timeout for `git gc`, which prints nothing while repacking. */
const PruneTimeoutMs = 5 * 60 * 1000;

function splitLines(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

let gitUnavailableNotified = false;

function notifyGitUnavailable(errorMessage: string) {
  if (gitUnavailableNotified) return;
  gitUnavailableNotified = true;

  // On macOS git is a shim that breaks after an Xcode update until the
  // command line tools are reinstalled.
  const hint = errorMessage.includes("xcrun")
    ? 'Run "xcode-select --install" in a terminal, then reload the window.'
    : "Install git and make sure it is available on your PATH, then reload the window.";
  void vscode.window.showWarningMessage(
    `Pochi checkpoints are unavailable because git cannot run: ${errorMessage}. ${hint}`,
  );
}

export class ShadowGitRepo implements vscode.Disposable {
  private git: SimpleGit;

  static async getOrCreate(
    gitPath: string,
    workspaceDir: string,
  ): Promise<ShadowGitRepo> {
    try {
      await simpleGit({
        timeout: { block: constants.GitOperationTimeoutMs },
      }).version();
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      notifyGitUnavailable(errorMessage);
      throw new Error(
        `Git must be installed to use checkpoints: ${errorMessage}`,
      );
    }

    try {
      const shadowGitRepo = new ShadowGitRepo(gitPath, workspaceDir);
      await shadowGitRepo.init();
      return shadowGitRepo;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      throw new Error(
        `Failed to create shadow git repository: ${errorMessage}`,
      );
    }
  }

  constructor(
    /**
     * Path to the bare git repository directory for the shadow repository.
     */
    private gitPath: string,
    private workspaceDir: string,
  ) {
    this.git = simpleGit(this.gitPath, {
      timeout: { block: constants.GitOperationTimeoutMs },
    }).env("GIT_DIR", this.gitPath);
  }

  async init() {
    try {
      // Check if bare repository already exists by looking for git files
      const headFile = path.join(this.gitPath, "HEAD");
      const exists = await isFileExists(headFile);

      if (exists) {
        logger.trace(
          `Shadow Git repository already exists at ${this.gitPath}.`,
        );
        // For bare repository, check worktree config
        try {
          const worktreeResult = await this.git.raw([
            "config",
            "core.worktree",
          ]);
          const currentWorktree = worktreeResult.trim();
          if (currentWorktree && currentWorktree !== this.workspaceDir) {
            throw new Error(
              `The worktree for the repository at ${this.gitPath} is already set to ${currentWorktree}, but expected ${this.workspaceDir}.`,
            );
          }
          // If worktree is not set, set it
          if (!currentWorktree) {
            await this.git.raw(["config", "core.worktree", this.workspaceDir]);
            logger.trace(
              `Set worktree to ${this.workspaceDir} for existing repository.`,
            );
          }
        } catch (configError) {
          // If config doesn't exist, set it
          await this.git.raw(["config", "core.worktree", this.workspaceDir]);
          logger.trace(
            `Set worktree to ${this.workspaceDir} for existing repository.`,
          );
        }
        await writeExcludesFile(this.gitPath, this.workspaceDir);
        return;
      }

      // Initialize bare repository
      await this.git.init(["--bare"]);

      // Configure the bare repository
      await this.git.raw(["config", "core.worktree", this.workspaceDir]);
      await this.git.raw(["config", "commit.gpgSign", "false"]);
      await this.git.raw(["config", "user.name", "Pochi Checkpoint"]);
      await this.git.raw(["config", "user.email", "noreply@getpochi.com"]);

      logger.trace(`Initialized shadow Git repository at ${this.gitPath}.`);

      await writeExcludesFile(this.gitPath, this.workspaceDir);

      if (await this.stageAll()) {
        await this.commit("Pochi Shadow Repo Initial Commit");
      }
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error(
        `Failed to initialize shadow git repository: ${errorMessage}`,
        {
          error,
          gitPath: this.gitPath,
          workspaceDir: this.workspaceDir,
        },
      );
      throw new Error(
        `Failed to initialize shadow git repository: ${errorMessage}`,
      );
    }
  }

  // Get the latest commit hash in short form
  async getLatestCommitHash(search: string): Promise<string | null> {
    try {
      // Initialization may skip the first checkpoint because a file is too large.
      if (
        !(await this.git.raw(["rev-list", "--all", "--max-count=1"])).trim()
      ) {
        return null;
      }
      const result = await this.git.raw([
        "log",
        "-1",
        "--oneline",
        "--grep",
        search,
      ]);
      const trimmedHash = result.split(/\s+/)[0].trim();
      logger.debug(`Latest commit hash: ${trimmedHash}`);
      return trimmedHash || null;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error(
        `Failed to get the latest commit hash for the repository at ${this.gitPath}: ${errorMessage}`,
      );
      throw new Error(
        `Failed to get the latest commit hash for the repository at ${this.gitPath}: ${errorMessage}`,
      );
    }
  }

  /**
   * Whether the index differs from HEAD, i.e. whether a commit would record
   * any change. Call it after {@link stageAll}.
   */
  async hasStagedChanges(): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance is not initialized");
    }
    const output = await this.git.raw([
      "--work-tree",
      this.workspaceDir,
      "diff",
      "--cached",
      "--name-only",
      "--ignore-submodules=all",
    ]);
    return output.trim().length > 0;
  }

  /**
   * Stages a complete snapshot, or returns false without staging if a new or
   * modified file is too large. Never remove individual files from the index:
   * restoring a snapshot that omits an existing file can delete that file.
   */
  async stageAll(): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance is not initialized");
    }
    const largeFiles = await this.findLargeChangedFiles();
    if (largeFiles.length > 0) {
      logger.warn(
        `Skipping checkpoint because ${largeFiles.length} new or modified file(s) exceed ${MaxCheckpointFileSize} bytes: ${largeFiles.join(", ")}`,
      );
      return false;
    }
    try {
      await this.git.raw([
        "--work-tree",
        this.workspaceDir,
        "add",
        ".",
        "--ignore-errors",
      ]);
    } catch (error) {
      // A partially staged index must not become a checkpoint either.
      logger.warn(
        `Skipping checkpoint because files could not be staged in the repository at ${this.gitPath}: ${toErrorMessage(error)}`,
      );
      return false;
    }
    logger.trace(`Staged changes in the repository at ${this.gitPath}.`);
    return true;
  }

  private async findLargeChangedFiles(): Promise<string[]> {
    const changed = await this.git.raw([
      "--work-tree",
      this.workspaceDir,
      "ls-files",
      "-z",
      "--others",
      "--modified",
      "--exclude-standard",
    ]);
    // Include changes already staged by a previous diff or interrupted save.
    // With no HEAD yet, diff --cached lists the entire index.
    const staged = await this.git.raw([
      "--work-tree",
      this.workspaceDir,
      "diff",
      "--cached",
      "--name-only",
      "-z",
      "--no-renames",
    ]);
    const candidates = [
      ...new Set(`${changed}${staged}`.split("\0").filter(Boolean)),
    ];
    const largeFiles: string[] = [];
    const batchSize = 64;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const sizes = await Promise.all(
        batch.map(async (file) => {
          try {
            const stat = await fs.lstat(path.join(this.workspaceDir, file));
            return stat.isFile() ? stat.size : 0;
          } catch (error) {
            // Deleted files do not add any new content to the checkpoint.
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
            throw error;
          }
        }),
      );
      batch.forEach((file, index) => {
        if (sizes[index] > MaxCheckpointFileSize) {
          largeFiles.push(file);
        }
      });
    }
    return largeFiles;
  }

  /**
   * Deletes checkpoints committed before `retentionMs` ago, at most once per
   * `intervalMs`.
   *
   * Commit hashes of the remaining checkpoints stay the same: the oldest kept
   * commits are listed in `$GIT_DIR/shallow`, so git treats them as having no
   * parents, and gc then deletes everything older. gc keeps unreachable
   * objects younger than {@link PruneGracePeriod}, which lets it run while
   * other windows sharing this repository are saving checkpoints, the same
   * way git's own background gc does.
   *
   * @returns whether old checkpoints were found and pruned.
   */
  async pruneCheckpoints(
    retentionMs: number,
    intervalMs: number,
  ): Promise<boolean> {
    if (!this.git) {
      throw new Error("Git instance is not initialized");
    }
    const markerFile = path.join(this.gitPath, "pochi-last-prune");
    const lastPrunedAt = await fs
      .stat(markerFile)
      .then((stat) => stat.mtimeMs)
      .catch(() => 0);
    if (Date.now() - lastPrunedAt < intervalMs) {
      return false;
    }
    await fs.writeFile(markerFile, "");

    const cutoff = new Date(Date.now() - retentionMs).toISOString();
    // Restoring a checkpoint moves HEAD back with `reset --hard`, so newer
    // checkpoints can be reachable only from the reflog. Keep recent entries.
    await this.git.raw([
      "reflog",
      "expire",
      `--expire=${cutoff}`,
      `--expire-unreachable=${cutoff}`,
      "--all",
    ]);
    const tips = splitLines(
      await this.git.raw(["rev-list", "--all", "--reflog", "--no-walk"]),
    );
    const recent = splitLines(
      await this.git.raw([
        "rev-list",
        "--all",
        "--reflog",
        `--since=${cutoff}`,
        "--parents",
      ]),
    ).map((line) => line.split(" "));
    const recentCommits = new Set(recent.map(([commit]) => commit));
    const kept = new Set([...recentCommits, ...tips]);

    const shallowFile = path.join(this.gitPath, "shallow");
    const previousBoundaries = splitLines(
      await fs.readFile(shallowFile, "utf8").catch(() => ""),
    );
    // Boundaries from an earlier prune already show no parents, so carry over
    // the ones that are still kept.
    const boundaries = new Set(
      previousBoundaries.filter((commit) => kept.has(commit)),
    );
    for (const [commit, ...parents] of recent) {
      if (parents.some((parent) => !kept.has(parent))) {
        boundaries.add(commit);
      }
    }
    // A ref or reflog entry older than the cutoff is kept, without its history.
    for (const tip of tips) {
      if (!recentCommits.has(tip)) {
        boundaries.add(tip);
      }
    }
    if (
      [...boundaries].every((commit) => previousBoundaries.includes(commit))
    ) {
      return false;
    }

    const tmpShallowFile = `${shallowFile}.pochi-${randomUUID()}`;
    await fs.writeFile(
      tmpShallowFile,
      [...boundaries].map((commit) => `${commit}\n`).join(""),
    );
    await fs.rename(tmpShallowFile, shallowFile);
    // A commit-graph still lists the pruned commits. Git ignores it in a
    // shallow repository, but `git fsck` reports it as corrupt.
    const objectInfoDir = path.join(this.gitPath, "objects", "info");
    await fs.rm(path.join(objectInfoDir, "commit-graph"), { force: true });
    await fs.rm(path.join(objectInfoDir, "commit-graphs"), {
      force: true,
      recursive: true,
    });

    await simpleGit(this.gitPath, {
      timeout: { block: PruneTimeoutMs },
    })
      .env("GIT_DIR", this.gitPath)
      .raw([
        // Reflogs were already expired with our retention cutoff above. Do
        // not let gc expire them again using Git's shorter unreachable default
        // or user configuration after we have chosen the retained commits.
        "-c",
        "gc.reflogExpire=never",
        "-c",
        "gc.reflogExpireUnreachable=never",
        "gc",
        "--quiet",
        `--prune=${PruneGracePeriod}`,
      ]);
    logger.info(
      `Pruned checkpoints older than ${cutoff} in the repository at ${this.gitPath}.`,
    );
    return true;
  }

  async commit(commitMessage: string): Promise<string> {
    try {
      if (!this.git) {
        throw new Error("Git instance is not initialized");
      }
      // For bare repository with worktree, use --work-tree flag
      await this.git.raw([
        "--work-tree",
        this.workspaceDir,
        "commit",
        "-m",
        commitMessage,
        "--allow-empty",
        "--no-verify",
      ]);

      // The first successful snapshot may be a root commit after earlier skips.
      const commitHash = (await this.git.revparse(["--short", "HEAD"])).trim();

      logger.trace(
        `Committed changes in the repository at ${this.gitPath} with message: ${commitMessage}`,
      );
      return commitHash;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      const message = `Failed to commit changes in the repository at ${this.gitPath}: ${errorMessage}`;
      logger.error(message, {
        error,
        gitPath: this.gitPath,
        workspaceDir: this.workspaceDir,
        commitMessage,
      });
      throw new Error(message);
    }
  }

  async reset(commitHash: string, files?: string[]) {
    try {
      if (!this.git) {
        throw new Error("Git instance is not initialized");
      }
      // For bare repository with worktree, use --work-tree flag
      if (files && files.length > 0) {
        await this.git.raw([
          "--work-tree",
          this.workspaceDir,
          "checkout",
          commitHash,
          "--",
          ...files,
        ]);
      } else {
        await this.git.raw([
          "--work-tree",
          this.workspaceDir,
          "reset",
          "--hard",
          commitHash,
        ]);
      }
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error(
        `Failed to reset the repository at ${this.gitPath} to commit ${commitHash}: ${errorMessage}`,
      );
      throw new Error(
        `Failed to reset the repository at ${this.gitPath} to commit ${commitHash}: ${errorMessage}`,
      );
    }
  }

  async resetLatest() {
    try {
      const log = await this.git.log();
      if (log.latest) {
        await this.reset(log.latest.hash);
        logger.trace(
          `Reset the repository at ${this.gitPath} to the latest commit: ${log.latest.hash}`,
        );
      } else {
        throw new Error("No commits found in the repository.");
      }
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error(
        `Failed to reset the repository at ${this.gitPath} to the latest commit: ${errorMessage}`,
      );
      throw new Error(
        `Failed to reset the repository at ${this.gitPath} to the latest commit: ${errorMessage}`,
      );
    }
  }

  async getDiff(
    from: string,
    to?: string,
    files?: string[],
  ): Promise<FileChange[]> {
    const diffRange = to ? `${from}..${to}` : from;
    // For bare repository with worktree, use --work-tree flag like in reset method
    let command = [
      "--work-tree",
      this.workspaceDir,
      "diff",
      "--name-status",
      diffRange,
    ];
    if (files) {
      command = [...command, "--", ...files];
    }
    const diffSummaryOutput = await this.git.raw(command);

    const parsedDiffs = this.parseDiffOutput(diffSummaryOutput);
    const result: FileChange[] = [];

    for (const diffEntry of parsedDiffs) {
      const { status, filepath, oldFilepath } = diffEntry;
      let beforeContent: string | null = null;
      let afterContent: string | null = null;

      if (status === "A") {
        // Added file
        if (to) {
          // If 'to' commit is specified, get content from 'to'
          try {
            afterContent = await this.git.show([`${to}:${filepath}`]);
          } catch (_) {
            /* file might not exist in 'to' (e.g. if 'to' is also an old commit where it wasn't added yet) */
          }
        } else {
          // If 'to' is not specified, get content from current working directory
          try {
            afterContent = await fs.readFile(
              path.join(this.workspaceDir, filepath),
              "utf8",
            );
          } catch (_) {
            /* file might be deleted from working tree after status was taken */
          }
        }
      } else if (status === "D") {
        // Deleted file
        try {
          beforeContent = await this.git.show([`${from}:${filepath}`]);
        } catch (_) {
          /* file didn't exist in 'from' */
        }
      } else if (status === "M" || status === "R" || status === "C") {
        // Modified, Renamed or Copied file
        const effectiveOldFilepath = oldFilepath || filepath; // For rename/copy, use oldFilepath for beforeContent
        try {
          beforeContent = await this.git.show([
            `${from}:${effectiveOldFilepath}`,
          ]);
        } catch (_) {
          /* file didn't exist in 'from' */
        }

        if (to) {
          try {
            afterContent = await this.git.show([`${to}:${filepath}`]);
          } catch (_) {
            /* file didn't exist in 'to' */
          }
        } else {
          try {
            afterContent = await fs.readFile(
              path.join(this.workspaceDir, filepath),
              "utf8",
            );
          } catch (_) {
            /* file might be deleted from working tree after status was taken */
          }
        }
      }

      result.push({
        filepath,
        before: beforeContent,
        after: afterContent,
      });
    }
    return result;
  }

  private parseDiffOutput(
    diffOutput: string,
  ): Array<{ status: string; filepath: string; oldFilepath?: string }> {
    const lines = diffOutput
      .trim()
      .split("\n")
      .filter((line) => line.trim());
    return lines.map((line) => {
      const parts = line.split("\t");
      const status = parts[0].trim();
      if (status.startsWith("R") || status.startsWith("C")) {
        // Renamed or Copied file
        return { status: status[0], oldFilepath: parts[1], filepath: parts[2] };
      }
      // For other statuses, filepath is parts[1]
      return { status: status[0], filepath: parts[1] };
    });
  }

  async fileExistsInCommit(
    commitHash: string,
    filepath: string,
  ): Promise<boolean> {
    try {
      await this.git.show([`${commitHash}:${filepath}`]);
      return true;
    } catch {
      return false;
    }
  }

  dispose() {
    this.git = undefined as unknown as SimpleGit; // Clear the git instance
  }
}
