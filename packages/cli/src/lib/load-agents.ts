import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { getLogger } from "@getpochi/common";
import { isFileExists, parseAgentFile } from "@getpochi/common/tool-utils";
import type {
  CustomAgentFile,
  ValidCustomAgentFile,
} from "@getpochi/common/vscode-webui-bridge";
import { isValidCustomAgentFile } from "@getpochi/common/vscode-webui-bridge";
import type { CustomAgent } from "@getpochi/tools";

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
        const readFileContent = async (filePath: string) =>
          await fs.readFile(filePath, "utf-8");
        const agent = await parseAgentFile(filePath, readFileContent);
        agents.push({ ...agent, filePath });
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
): Promise<CustomAgent[]> {
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

    // Filter out invalid agents for CLI usage
    const validAgents = allAgents.filter(
      (agent): agent is ValidCustomAgentFile => {
        if (isValidCustomAgentFile(agent)) {
          return true;
        }
        logger.warn(
          `Ignoring invalid custom agent file ${agent.filePath}: [${agent.error}] ${agent.message}`,
        );
        return false;
      },
    );

    logger.debug(
      `Loaded ${allAgents.length} custom agents (${validAgents.length} valid, ${allAgents.length - validAgents.length} invalid)`,
    );
    return validAgents;
  } catch (error) {
    logger.error("Failed to load custom agents", error);
    return [];
  }
}
