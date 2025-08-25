import { describe, expect, it } from "vitest";
import { readEnvironment } from "../../lib/read-environment";
import type { RunnerOptions } from "../../task-runner";

describe("readEnvironment", () => {
  it("should return environment data for task runner", async () => {
    const context: Pick<RunnerOptions, "cwd"> = {
      cwd: process.cwd(),
    };

    const environment = await readEnvironment(context);

    expect(environment).toBeDefined();
    expect(environment.currentTime).toBeDefined();
    expect(environment.workspace).toBeDefined();
    expect(environment.workspace.files).toBeInstanceOf(Array);
    expect(environment.workspace.isTruncated).toBeDefined();
    expect(environment.info).toBeDefined();
    expect(environment.info.cwd).toBe(process.cwd());
    expect(environment.info.os).toBeDefined();
    expect(environment.info.shell).toBeDefined();
    expect(environment.info.homedir).toBeDefined();
  });

  it("should include git status if repository exists", async () => {
    const context: Pick<RunnerOptions, "cwd"> = {
      cwd: process.cwd(), // This should be a git repository
    };

    const environment = await readEnvironment(context);

    // Git status should be included if we're in a git repository
    if (environment.workspace.gitStatus) {
      expect(environment.workspace.gitStatus.currentBranch).toBeDefined();
      expect(environment.workspace.gitStatus.mainBranch).toBeDefined();
      expect(environment.workspace.gitStatus.status).toBeDefined();
      expect(environment.workspace.gitStatus.recentCommits).toBeInstanceOf(Array);
    }
  });

  it("should not include VSCode-specific data", async () => {
    const context: Pick<RunnerOptions, "cwd"> = {
      cwd: process.cwd(),
    };

    const environment = await readEnvironment(context);

    // Task runner should not have active tabs or selection like VSCode
    expect(environment.workspace.activeTabs).toBeUndefined();
    expect(environment.workspace.activeSelection).toBeUndefined();
  });
});

