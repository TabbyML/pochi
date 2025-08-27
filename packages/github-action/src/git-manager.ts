/**
 * Git operations manager
 */
import type * as github from "@actions/github";
import { $ } from "bun";
import type { GitHubPullRequest } from "./types";
import { generateBranchName } from "./utils";

export class GitManager {
  private gitConfigBackup = "";
  private isConfigured = false;

  async configure(appToken: string): Promise<void> {
    if (this.isConfigured) return;

    const config = "http.https://github.com/.extraheader";

    try {
      const ret = await $`git config --local --get ${config}`;
      this.gitConfigBackup = ret.stdout.toString().trim();
    } catch {
      this.gitConfigBackup = "";
    }

    const newCredentials = Buffer.from(
      `x-access-token:${appToken}`,
      "utf8",
    ).toString("base64");

    await $`git config --local --unset-all ${config}`.catch(() => {});
    await $`git config --local ${config} "AUTHORIZATION: basic ${newCredentials}"`;
    await $`git config --global user.name "pochi-agent"`;
    await $`git config --global user.email "noreply@getpochi.com"`;

    this.isConfigured = true;
  }

  async restore(): Promise<void> {
    if (!this.isConfigured) return;

    try {
      if (this.gitConfigBackup) {
        await $`git config --local "http.https://github.com/.extraheader" ${this.gitConfigBackup}`;
      } else {
        await $`git config --local --unset-all "http.https://github.com/.extraheader"`.catch(
          () => {},
        );
      }
    } catch (error) {
      console.error("Error restoring git config:", error);
    }

    this.isConfigured = false;
  }

  async checkoutLocalBranch(prData: GitHubPullRequest): Promise<void> {
    await $`git fetch origin ${prData.headRefName}`;
    await $`git checkout ${prData.headRefName}`;
  }

  async checkoutForkBranch(issueNumber: number): Promise<void> {
    const branch = generateBranchName("pr", issueNumber);
    await $`git fetch origin pull/${issueNumber}/head:${branch}`;
    await $`git checkout ${branch}`;
  }

  async isBranchDirty(): Promise<boolean> {
    try {
      const result = await $`git status --porcelain`;
      return result.stdout.toString().trim().length > 0;
    } catch {
      return false;
    }
  }

  async commitAndPushLocalBranch(message: string): Promise<void> {
    await $`git add -A`;
    await $`git commit -m ${message}`;
    await $`git push`;
  }

  async commitAndPushForkBranch(
    message: string,
    context: typeof github.context,
  ): Promise<void> {
    const branch = generateBranchName("pr", context.issue?.number || 0);

    await $`git add -A`;
    await $`git commit -m ${message}`;
    await $`git push -u origin ${branch}`;
  }
}
