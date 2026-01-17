import { getLogger, toErrorMessage } from "@getpochi/common";
import type { GithubIssue } from "@getpochi/common/vscode-webui-bridge";
import uFuzzy from "@leeoniya/ufuzzy";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { GitWorktreeInfoProvider } from "../git/git-worktree-info-provider";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorktreeManager } from "../git/worktree";
import { executeCommandWithNode } from "../terminal/execute-command-with-node";

const logger = getLogger("GithubIssueState");

const uf = new uFuzzy({
  unicode: true,
  intraMode: 1,
  interSplit: "[^\\p{L}\\d']+",
  intraSplit: "\\p{Ll}\\p{Lu}",
  intraBound: "\\p{L}\\d|\\d\\p{L}|\\p{Ll}\\p{Lu}",
  intraChars: "[\\p{L}\\d']",
  intraContr: "'\\p{L}{1,2}\\b",
});

const PageSize = 50;
const PollIntervalMS = 60 * 1000; // 1 minute
const OneYearAgoMS = 365 * 24 * 60 * 60 * 1000;
const MaxIssues = 3000;
const QueryLimit = 50;

@singleton()
@injectable()
export class GithubIssueState implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private pollingTimeout?: NodeJS.Timeout;

  constructor(
    private readonly worktreeInfoProvider: GitWorktreeInfoProvider,
    private readonly worktreeManager: WorktreeManager,
  ) {
    this.init();
  }

  private async init() {
    // wait all worktree loaded so we can get main worktree to fetch issues
    await this.worktreeManager.inited.promise;
    logger.debug("Initializing GithubIssueState integration");

    // Start initial check
    await this.checkForIssues();
  }

  private async checkForIssues() {
    try {
      const mainWorktree = this.worktreeManager.getMainWorktree();
      if (!mainWorktree) {
        logger.error("No main worktree found, skipping issue check");
        return;
      }

      const mainWorktreePath = mainWorktree.path;
      const currentIssuesData =
        await this.worktreeInfoProvider.getGithubIssues(mainWorktreePath);

      const updatedAt = currentIssuesData?.updatedAt;
      const isInitialCheck = !updatedAt;

      if (isInitialCheck) {
        logger.debug(
          `Performing initial issue check for main worktree: ${mainWorktreePath}`,
        );
        // For initial check, get only open issues from the last year
        const oneYearAgo = new Date(Date.now() - OneYearAgoMS);
        const updatedAt = oneYearAgo.toISOString();

        // Fetch all open issues with pagination
        await this.fetchAllIssues(
          mainWorktreePath,
          updatedAt,
          "open",
          currentIssuesData?.pageOffset,
        );
      } else {
        logger.trace(
          `Subsequent issue check: updatedAt >= ${updatedAt}, pageOffset = ${currentIssuesData.pageOffset}`,
        );
        // For subsequent checks, get all issues (open and closed) that have been updated since last check
        await this.fetchAllIssues(
          mainWorktreePath,
          updatedAt,
          "all",
          currentIssuesData.pageOffset,
        );
      }
    } catch (error) {
      logger.warn(`Failed to check for issues: ${toErrorMessage(error)}`);
    } finally {
      this.scheduleNextCheck();
    }
  }

  private async fetchAllIssues(
    worktreePath: string,
    updatedAt?: string,
    state: "open" | "all" = "open",
    pageOffset?: number,
  ): Promise<GithubIssue[]> {
    const allIssues: GithubIssue[] = [];
    let page = pageOffset ?? 1;
    let hasMore = true;

    while (hasMore) {
      try {
        const issues = await this.fetchIssuesPage(
          worktreePath,
          page,
          updatedAt,
          state,
        );

        allIssues.push(...issues);

        // If we got fewer issues than the page size, we've reached the end
        hasMore = issues.length === PageSize;
        page++;

        const currentIssuesData =
          await this.worktreeInfoProvider.getGithubIssues(worktreePath);
        // Process the updated issues: remove closed issues from current list and add new open issues
        const currentIssues = currentIssuesData?.data ?? [];
        const updatedIssues = this.processUpdatedIssues(
          currentIssues,
          allIssues,
        );

        if (updatedIssues.length >= MaxIssues) {
          hasMore = false;
        }

        if (hasMore) {
          await this.worktreeInfoProvider.updateGithubIssues(worktreePath, {
            pageOffset: page,
            data: updatedIssues,
          });
          logger.trace(
            `Updated issues for worktree ${worktreePath}, page ${page}, total issues: ${updatedIssues.length}`,
          );
        } else {
          const now = new Date().toISOString();
          await this.worktreeInfoProvider.updateGithubIssues(worktreePath, {
            updatedAt: currentIssuesData?.processedAt ?? now,
            processedAt: now,
            pageOffset: 0,
            data: updatedIssues,
          });
          logger.trace(
            `Completed fetching issues for worktree ${worktreePath}, total issues: ${updatedIssues.length}`,
          );
        }
      } catch (error) {
        logger.warn(
          `Failed to fetch issues page ${page}: ${toErrorMessage(error)}`,
        );
        hasMore = false;
      }
    }

    return allIssues;
  }

  private async fetchIssuesPage(
    worktreePath: string,
    page: number,
    updatedAt?: string,
    state: "open" | "all" = "open",
  ): Promise<GithubIssue[]> {
    try {
      const repoInfoCommand = `gh repo view --json nameWithOwner --jq '.nameWithOwner'`;
      const repoInfoResult = await executeCommandWithNode({
        command: repoInfoCommand,
        cwd: worktreePath,
        timeout: 30,
        color: false,
      });

      const repoFullName = repoInfoResult.output.trim();
      if (!repoFullName) {
        logger.warn(
          `Failed to get repository name for worktree ${worktreePath}`,
        );
        return [];
      }

      let command = `gh api "/repos/${repoFullName}/issues?state=${state}&per_page=${PageSize}&page=${page}" --jq '.[] | {number, title, url: url, state}'`;

      if (updatedAt) {
        // For date filtering, we need to use search API instead of issues API
        let searchQuery = `repo:${repoFullName} type:issue`;
        if (state === "open") {
          searchQuery += " is:open";
        }
        searchQuery += ` updated:>=${updatedAt}`;
        searchQuery += " sort:created-desc";

        command = `gh api "/search/issues?q=${encodeURIComponent(searchQuery)}&per_page=${PageSize}&page=${page}" --jq '.items[] | {number: .number, title: .title, url: .html_url, state: .state}'`;
      }
      logger.trace(`Fetching issues page ${page}: ${command}`);

      const result = await executeCommandWithNode({
        command,
        cwd: worktreePath,
        timeout: 30,
        color: false,
      });

      const output = result.output.trim();
      if (!output) {
        return [];
      }

      interface RawGithubIssue {
        number: number;
        title: string;
        url: string;
        state: string;
      }

      // Split the output by newlines and parse each JSON object
      const lines = output.split("\n").filter((line) => line.trim() !== "");
      const issues: RawGithubIssue[] = lines.map((line) => JSON.parse(line));

      return issues.map((issue) => ({
        id: issue.number,
        title: issue.title,
        url: issue.url,
        state: issue.state.toLowerCase() as "open" | "closed",
      }));
    } catch (error) {
      logger.warn(
        `Failed to fetch issues page ${page} for worktree ${worktreePath}: ${toErrorMessage(error)}`,
      );
      return [];
    }
  }
  private processUpdatedIssues(
    currentIssues: GithubIssue[],
    updatedIssues: GithubIssue[],
  ): GithubIssue[] {
    // Create a map of current issues by id for quick lookup
    const currentIssueMap = new Map<number, GithubIssue>();
    for (const issue of currentIssues) {
      currentIssueMap.set(issue.id, issue);
    }

    // Create a map of updated issues by id for quick lookup
    const updatedIssueMap = new Map<number, GithubIssue>();
    for (const issue of updatedIssues) {
      updatedIssueMap.set(issue.id, issue);
    }

    // Start with current issues
    const resultIssues = [...currentIssues];

    // Remove closed issues from the current list that are no longer in the updated list
    const updatedIssueIds = new Set(updatedIssues.map((issue) => issue.id));
    const filteredIssues = resultIssues.filter(
      (issue) => updatedIssueIds.has(issue.id) || issue.state !== "closed",
    );

    // Add any new open issues from the updated list that weren't in the current list
    const resultIssueIds = new Set(filteredIssues.map((issue) => issue.id));
    for (const updatedIssue of updatedIssues) {
      if (
        updatedIssue.state === "open" &&
        !resultIssueIds.has(updatedIssue.id)
      ) {
        filteredIssues.push(updatedIssue);
      }
    }

    return filteredIssues.sort((a, b) => b.id - a.id);
  }

  private scheduleNextCheck() {
    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
    }

    this.pollingTimeout = setTimeout(() => {
      this.checkForIssues();
    }, PollIntervalMS);
  }

  queryIssues = async (query?: string): Promise<GithubIssue[]> => {
    try {
      // Find the main worktree for this cwd
      const worktrees = this.worktreeManager.worktrees.value;
      const mainWorktree = worktrees.find((wt) => wt.isMain);

      if (!mainWorktree) {
        logger.trace("No main worktree found for queryIssues");
        return [];
      }

      const issuesData = await this.worktreeInfoProvider.getGithubIssues(
        mainWorktree.path,
      );
      if (!issuesData?.data) {
        return [];
      }

      const issues = issuesData.data;

      if (!query) {
        return issues.slice(0, QueryLimit);
      }

      // Check for fuzzy match by issue ID (substring match)
      const queryAsNumber = Number(query);
      let idMatches: GithubIssue[] = [];
      if (!Number.isNaN(queryAsNumber)) {
        idMatches = issues.filter((issue) =>
          issue.id.toString().includes(queryAsNumber.toString()),
        );
      }

      // Filter by fuzzy search in title
      const haystack = issues.map((issue) => issue.title);
      const [idxs, info, order] = uf.search(haystack, query, 1);

      const titleMatches: GithubIssue[] = [];
      if (order && info) {
        for (const i of order) {
          titleMatches.push(issues[info.idx[i]]);
        }
      } else if (idxs) {
        for (const i of idxs) {
          titleMatches.push(issues[i]);
        }
      }

      // Combine ID matches and title matches, prioritize ID matches, then return first 10
      const allMatches = [
        ...idMatches,
        ...titleMatches.filter(
          (titleMatch) =>
            !idMatches.some((idMatch) => idMatch.id === titleMatch.id),
        ),
      ];

      return allMatches.slice(0, QueryLimit);
    } catch (error) {
      logger.warn(`Failed to query issues: ${toErrorMessage(error)}`);
      return [];
    }
  };

  dispose() {
    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
