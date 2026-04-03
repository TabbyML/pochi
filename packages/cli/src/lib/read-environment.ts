import fs from "node:fs/promises";
import type { Environment } from "@getpochi/common";
import {
  GitStatusReader,
  collectCustomRules,
  getSystemInfo,
} from "@getpochi/common/tool-utils";
import type { RunnerOptions } from "../task-runner";
/**
 * Read the environment for the task runner
 */
export const readEnvironment = async (
  context: Pick<RunnerOptions, "cwd"> & {
    omitCustomRules?: boolean;
  },
): Promise<Environment> => {
  const { cwd, omitCustomRules } = context;

  const readFileContent = async (filePath: string) =>
    await fs.readFile(filePath, "utf-8");

  const customRules = omitCustomRules
    ? undefined
    : await collectCustomRules(cwd, readFileContent);
  const systemInfo = getSystemInfo(cwd);
  const gitStatusReader = new GitStatusReader({ cwd });
  const gitStatus = await gitStatusReader.readGitStatus();

  const environment: Environment = {
    currentTime: new Date().toString(),
    workspace: {
      gitStatus,
      // Task runner doesn't have active tabs or selection like VSCode
      activeTabs: undefined,
    },
    info: {
      ...systemInfo,
      customRules,
    },
  };

  return environment;
};
