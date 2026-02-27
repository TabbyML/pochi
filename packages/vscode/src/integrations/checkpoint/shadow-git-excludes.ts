import fs from "node:fs/promises";
import { join } from "node:path";
import { getWorkspaceExcludePatterns } from "@getpochi/common/tool-utils";

export const writeExcludesFile = async (
  gitPath: string,
  workspaceDir: string,
): Promise<void> => {
  const excludesPath = join(gitPath, "info", "exclude");
  await fs.mkdir(join(gitPath, "info"), { recursive: true });
  const patterns = await getWorkspaceExcludePatterns(workspaceDir);
  await fs.writeFile(excludesPath, patterns.join("\n"));
};
