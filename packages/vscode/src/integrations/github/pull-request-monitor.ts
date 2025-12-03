import { getLogger, toErrorMessage } from "@getpochi/common";
import type {
  GitWorktree,
  GitWorktreeInfo,
} from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { GitWorktreeInfoProvider } from "../git/git-worktree-info-provider";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorktreeManager } from "../git/worktree";
import { executeCommandWithNode } from "../terminal/execute-command-with-node";

const logger = getLogger("GithubPR");

@singleton()
@injectable()
export class GithubPullRequestMonitor implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  ghCliCheck = signal<{ installed: boolean; authorized: boolean }>({
    installed: false,
    authorized: false,
  });

  constructor(
    private readonly worktreeManager: WorktreeManager,
    private readonly worktreeInfoProvider: GitWorktreeInfoProvider,
  ) {
    this.init();
  }

  async init() {
    this.ghCliCheck.value = await checkGithubCli();
    if (!this.ghCliCheck.value.authorized) {
      return;
    }
    const worktrees = this.worktreeManager.worktrees.value;
    await this.checkWorktreesPrInfo(worktrees);
    this.startPolling();
  }

  private startPolling() {
    const interval = setInterval(async () => {
      if (!this.ghCliCheck.value.authorized) {
        return;
      }
      const worktrees = this.worktreeManager.worktrees.value;
      let hasUpdates = false;
      for (const worktree of worktrees) {
        const currentInfo = this.worktreeInfoProvider.get(worktree.path);
        if (
          !currentInfo ||
          !currentInfo.github.pullRequest ||
          currentInfo?.github.pullRequest?.status === "open"
        ) {
          const updated = await this.fetchWorktreePrInfo(worktree);
          if (updated) {
            hasUpdates = true;
          }
        }
      }

      if (hasUpdates) {
        await this.worktreeManager.updateWorktrees();
      }
    }, 30 * 1000);

    this.disposables.push({
      dispose: () => clearInterval(interval),
    });
  }

  async checkWorktreesPrInfo(worktrees: GitWorktree[]) {
    for (const worktree of worktrees) {
      await this.checkWorktreePrInfo(worktree);
    }
    await this.worktreeManager.updateWorktrees();
  }

  async checkWorktreePrInfo(worktree: GitWorktree) {
    const currentInfo = this.worktreeInfoProvider.get(worktree.path);
    if (
      !currentInfo ||
      !currentInfo.github.pullRequest ||
      currentInfo.github.pullRequest.status === "open"
    ) {
      await this.fetchWorktreePrInfo(worktree);
    }
  }

  async fetchWorktreePrInfo(worktree: GitWorktree) {
    if (!this.ghCliCheck.value.authorized) {
      return;
    }

    if (!worktree.branch) {
      return;
    }
    const prInfo = await getGithubPr(worktree.branch, worktree.path);
    logger.debug(
      `Fetched PR info for worktree ${worktree.path} (branch: ${worktree.branch}): ${
        prInfo ? JSON.stringify(prInfo) : "no PR"
      }`,
    );
    if (prInfo) {
      const currentInfo = this.worktreeInfoProvider.get(worktree.path);
      const currentPrInfo = currentInfo?.github?.pullRequest;
      if (JSON.stringify(currentPrInfo) !== JSON.stringify(prInfo)) {
        this.worktreeInfoProvider.updateGithubPullRequest(
          worktree.path,
          prInfo,
        );
        return prInfo;
      }
    }
    return;
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
): Promise<NonNullable<GitWorktreeInfo["github"]["pullRequest"]> | null> => {
  try {
    // Get PR information for the given branch using gh cli
    let result: { output: string; isTruncated: boolean };
    const command = `gh pr view ${branch} --json number,state,mergedAt,closedAt`;
    logger.trace(`Executing command to fetch PR: ${command}`);
    try {
      result = await executeCommandWithNode({
        command,
        cwd,
        timeout: 30, // 30 seconds timeout
        color: false,
      });
    } catch (error: unknown) {
      logger.error(
        `Error fetching PR with command "${command}": ${toErrorMessage(error)}`,
      );
      return null;
    }

    logger.trace("result.output:", result.output);

    // The executeCommandWithNode returns { output: string; isTruncated: boolean }
    // We need to parse the output to get the PR data
    const prData = JSON.parse(result.output.trim());

    if (!prData || !prData.number) {
      logger.trace(`No PR found for branch: ${branch}`);
      return null; // No PR found for this branch
    }

    // Get check statuses for the PR
    let checkResult: { output: string; isTruncated: boolean };
    const checksCommand = `gh pr checks ${branch} --json name,state,link`;
    logger.trace(`Executing command to fetch PR checks: ${checksCommand}`);
    try {
      checkResult = await executeCommandWithNode({
        command: checksCommand,
        cwd,
        timeout: 30, // 30 seconds timeout
        color: false,
      });
    } catch (error: unknown) {
      logger.warn(
        `Error fetching PR checks with command "${checksCommand}": ${toErrorMessage(error)}`,
      );
      // If checks fail, continue with empty checks array
      checkResult = { output: "[]", isTruncated: false };
    }

    logger.trace("result.output:", result.output);

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
