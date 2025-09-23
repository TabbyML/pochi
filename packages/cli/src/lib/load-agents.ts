import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { getLogger } from "@getpochi/common";
import { isFileExists, parseAgentFile } from "@getpochi/common/tool-utils";
import type { CustomAgentFile } from "@getpochi/common/vscode-webui-bridge";

const logger = getLogger("CustomAgentManager");

/**
 * Read custom agents from a directory
 */
async function readAgentsFromDir(dir: string): Promise<CustomAgentFile[]> {
  const agents: CustomAgentFile[] = [];
  try {
    if (!isFileExists(dir)) {
      return agents;
    }

    const files = await fs.readdir(dir);
    for (const fileName of files) {
      if (fileName.endsWith(".md")) {
        const filePath = path.join(dir, fileName);
        try {
          const contentStr = await fs.readFile(filePath, "utf-8");
          const agent = await parseAgentFile(filePath, contentStr);
          if (agent) {
            agents.push({ ...agent, filePath });
          }
        } catch (error) {
          logger.debug(`Could not read agent file ${filePath}:`, error);
        }
      }
    }
  } catch (error) {
    // Directory may not exist, which is fine.
    logger.debug(`Could not read agents from directory ${dir}:`, error);
  }
  return agents;
}

export async function loadAgents(
  workingDirectory?: string,
): Promise<CustomAgentFile[]> {
  try {
    const allAgents: CustomAgentFile[] = [];

    // Load project agents if working directory is provided
    if (workingDirectory) {
      const projectAgentsDir = path.join(workingDirectory, ".pochi", "agents");
      allAgents.push(...(await readAgentsFromDir(projectAgentsDir)));
    }

    // Load system agents
    const systemAgentsDir = path.join(os.homedir(), ".pochi", "agents");
    allAgents.push(...(await readAgentsFromDir(systemAgentsDir)));

    logger.debug(`Loaded ${allAgents.length} custom agents`);
    return allAgents;
  } catch (error) {
    logger.error("Failed to load custom agents", error);
    return [];
  }
}
