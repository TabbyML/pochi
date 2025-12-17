import { getLogger, toErrorMessage } from "@getpochi/common";
import {
  type GitRepositoryInfo,
  parseGitOriginUrl,
} from "@getpochi/common/git-utils";
import type {
  GitWorktree,
  GitWorktreeInfo,
} from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { funnel } from "remeda";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { GitState } from "../git/git-state";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { GitWorktreeInfoProvider } from "../git/git-worktree-info-provider";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorktreeManager } from "../git/worktree";
import { executeCommandWithNode } from "../terminal/execute-command-with-node";

const logger = getLogger("GithubPullRequestState");

@singleton()
@injectable()
export class GithubPullRequestState implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  gh = signal<{ installed: boolean; authorized: boolean }>({
    installed: false,
    authorized: false,
  });

  repoInfo?: GitRepositoryInfo;

  constructor(
    private readonly worktreeManager: WorktreeManager,
    private readonly worktreeInfoProvider: GitWorktreeInfoProvider,
    private readonly gitState: GitState,
  ) {
    this.init();
  }

  async init() {
    await this.worktreeManager.inited.promise;
    this.queueCheck();
    this.disposables.push(
      this.gitState.onDidChangeBranch(async (e) => {
        if (e.type === "branch-changed" && e.currentBranch !== undefined) {
          await this.worktreeInfoProvider.updateGithubPullRequest(
            e.repository,
            undefined,
          );
          await this.worktreeManager.updateWorktrees();
          this.queueCheck(e.repository);
        }
      }),
    );
    this.disposables.push(
      this.gitState.onDidChangeRepository(async (e) => {
        if (e.type === "repository-changed" && e.change === "added") {
          await this.worktreeManager.updateWorktrees();
          this.queueCheck(e.repository);
        }
      }),
    );
    this.startPolling();
  }

  private startPolling() {
    const interval = setInterval(() => {
      this.queueCheck();
    }, 30 * 1000);

    this.disposables.push({
      dispose: () => clearInterval(interval),
    });
  }

  private pathsToCheck = new Set<string>();
  private checkAllPending = false;

  private queueCheck(path?: string) {
    if (path) {
      this.pathsToCheck.add(path);
    } else {
      this.checkAllPending = true;
    }
    this.throttledProcessQueue.call();
  }

  throttledProcessQueue = funnel(() => this.processQueue(), {
    minGapMs: 1_000,
    triggerAt: "both",
  });

  private async processQueue() {
    const checkAll = this.checkAllPending;
    const paths = new Set(this.pathsToCheck);

    this.checkAllPending = false;
    this.pathsToCheck.clear();

    if (checkAll) {
      await this.checkWorktreesPrInfo();
    } else if (paths.size > 0) {
      await this.checkWorktreesPrInfo(paths);
    }
  }

  async checkWorktreesPrInfo(targetPaths?: Set<string>) {
    const gitOriginUrl = await this.worktreeManager.getOriginUrl();
    if (!gitOriginUrl) {
      return;
    }

    this.repoInfo = parseGitOriginUrl(gitOriginUrl) ?? undefined;
    if (this.repoInfo?.platform !== "github") {
      return;
    }

    this.gh.value = await checkGithubCli();
    if (!this.gh.value.authorized) {
      return;
    }
    const worktrees = this.worktreeManager.worktrees.value;

    const worktreesToCheck = targetPaths
      ? worktrees.filter((w) => targetPaths.has(w.path))
      : worktrees;

    await Promise.all(
      worktreesToCheck.map(async (worktree) => {
        const currentInfo = this.worktreeInfoProvider.get(worktree.path);
        if (
          !currentInfo ||
          !currentInfo.github.pullRequest ||
          currentInfo?.github.pullRequest?.status === "open"
        ) {
          const updated = await this.fetchWorktreePrInfo(worktree);
          if (updated) {
            this.updateWorktreeSignal(worktree.path);
          }
        }
      }),
    );
  }

  private updateWorktreeSignal(path: string) {
    const currentWorktrees = this.worktreeManager.worktrees.value;
    const index = currentWorktrees.findIndex((w) => w.path === path);
    if (index !== -1) {
      const newWorktrees = [...currentWorktrees];
      newWorktrees[index] = {
        ...newWorktrees[index],
        data: this.worktreeInfoProvider.get(path),
      };
      this.worktreeManager.worktrees.value = newWorktrees;
    }
  }

  async fetchWorktreePrInfo(worktree: GitWorktree) {
    if (!this.gh.value.authorized) {
      return;
    }

    if (!worktree.branch) {
      return;
    }
    const prInfo = await getGithubPr(
      worktree.branch,
      worktree.path,
      this.repoInfo,
    );
    logger.trace(
      `Fetched PR info for worktree ${worktree.path} (branch: ${worktree.branch}): ${
        prInfo ? JSON.stringify(prInfo) : "no PR"
      }`,
    );

    const currentInfo = this.worktreeInfoProvider.get(worktree.path);
    const currentPrInfo = currentInfo?.github?.pullRequest;
    const newPrInfo = prInfo ?? undefined;

    if (JSON.stringify(currentPrInfo) !== JSON.stringify(newPrInfo)) {
      await this.worktreeInfoProvider.updateGithubPullRequest(
        worktree.path,
        newPrInfo,
      );
      return true;
    }
    return false;
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

const checkGithubCli = async (
  cwd: string = process.cwd(),
): Promise<{
  installed: boolean;
  authorized: boolean;
}> => {
  try {
    // Check if gh CLI is installed by running a simple command
    const installedResult = await executeCommandWithNode({
      command: "gh --version",
      cwd,
      timeout: 10,
    });

    const installed = installedResult.output.includes("gh version");

    if (!installed) {
      return { installed: false, authorized: false };
    }

    // Check if gh CLI is authenticated
    try {
      const authResult = await executeCommandWithNode({
        command: "gh auth status",
        cwd,
        timeout: 10,
      });

      // If auth status command succeeds, the user is authorized
      const authorized = !authResult.output.includes("unauthorized");

      return { installed: true, authorized };
    } catch (authError) {
      // If auth status fails, user is not authorized
      return { installed: true, authorized: false };
    }
  } catch (error) {
    // If version check fails, gh CLI is not installed
    return { installed: false, authorized: false };
  }
};

const getGithubPr = async (
  branch: string,
  cwd: string = process.cwd(),
  repoInfo?: GitRepositoryInfo,
): Promise<NonNullable<GitWorktreeInfo["github"]["pullRequest"]> | null> => {
  try {
    const fetchPr = async () => {
      const command = `gh pr list --head "${branch}" --state open --json number,state,mergedAt,closedAt,isCrossRepository,headRepositoryOwner,headRepository`;
      logger.trace(`Executing command to fetch PR: ${command}`);
      try {
        const result = await executeCommandWithNode({
          command,
          cwd,
          timeout: 30,
          color: false,
        });
        const prs = JSON.parse(result.output.trim()) as {
          number: number;
          state: string;
          mergedAt: string | null;
          closedAt: string | null;
          isCrossRepository: boolean;
          headRepositoryOwner: { login: string };
          headRepository: { name: string };
        }[];
        // Find PR that matches our current repository info
        return (
          prs.find((pr) => {
            // If it's not a cross repo PR, it's definitely ours
            if (!pr.isCrossRepository) return true;

            // If it is cross repo, check if it matches our current repo
            if (repoInfo) {
              return (
                pr.headRepositoryOwner.login === repoInfo.owner &&
                pr.headRepository.name === repoInfo.repo
              );
            }
            return false;
          }) || null
        );
      } catch (error: unknown) {
        logger.trace(
          `Error fetching PR with command "${command}": ${toErrorMessage(error)}`,
        );
        return null;
      }
    };

    const prData = await fetchPr();

    if (!prData || !prData.number) {
      logger.trace(`No PR found for branch: ${branch}`);
      return null;
    }

    // Get check statuses for the PR
    let checkResult: { output: string; isTruncated: boolean };
    const checksCommand = `gh pr checks ${prData.number} --json name,state,link`;
    logger.trace(`Executing command to fetch PR checks: ${checksCommand}`);
    try {
      checkResult = await executeCommandWithNode({
        command: checksCommand,
        cwd,
        timeout: 30, // 30 seconds timeout
        color: false,
      });
    } catch (error: unknown) {
      logger.trace(
        `Error fetching PR checks with command "${checksCommand}": ${toErrorMessage(error)}`,
      );
      // If checks fail, continue with empty checks array
      checkResult = { output: "[]", isTruncated: false };
    }

    logger.trace("checkResult.output:", checkResult.output);

    interface CheckStatus {
      name: string;
      state: string;
      link: string; // gh CLI uses 'link' instead of 'url' for checks
    }

    let checks: CheckStatus[] = [];
    try {
      checks = JSON.parse(checkResult.output.trim()) || [];
    } catch (e: unknown) {
      logger.warn(`Could not parse check results: ${toErrorMessage(e)}`);
    }

    // Map the PR state to our status type
    let status: "open" | "closed" | "merged" = "open";
    if (prData.state === "CLOSED") {
      // Check if the PR was merged by checking if it has merge details
      status = prData.mergedAt ? "merged" : "closed";
    } else if (prData.state === "MERGED") {
      status = "merged";
    }

    return {
      id: prData.number,
      status,
      checks: checks.map((check) => ({
        name: check.name,
        state: check.state.toLowerCase() as "passed" | "failed" | "pending",
        url: check.link || "", // Map link to url as expected by the interface
      })),
    };
  } catch (error: unknown) {
    logger.error(`Error in getGithubPr: ${toErrorMessage(error)}`);
    return null;
  }
};
