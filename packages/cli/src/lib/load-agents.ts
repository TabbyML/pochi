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
import { uniqueBy } from "remeda";
import { getBuiltInAgentsDir } from "./builtin-agents-dir";

const logger = getLogger("loadAgents");

async function readAgentsFromDir(dir: string): Promise<CustomAgentFile[]> {
  const agents: CustomAgentFile[] = [];
  const readFileContent = async (filePath: string) =>
    await fs.readFile(filePath, "utf-8");

  try {
    if (!(await isFileExists(dir))) {
      return agents;
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        const agentFilePath = path.join(dir, entry.name, "AGENT.md");
        try {
          const stat = await fs.stat(agentFilePath);
          if (stat.isFile()) {
            const agent = await parseAgentFile(agentFilePath, readFileContent);
            agents.push({ ...agent, filePath: agentFilePath });
          }
        } catch (error) {
          logger.debug(`No AGENT.md found in ${entry.name}:`, error);
        }
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const agentFilePath = path.join(dir, entry.name);
        const agent = await parseAgentFile(agentFilePath, readFileContent);
        agents.push({ ...agent, filePath: agentFilePath });
      }
    }
  } catch (error) {
    logger.debug(`Could not read agents from directory ${dir}:`, error);
  }
  return agents;
}

export async function loadBuiltInAgents(): Promise<ValidCustomAgentFile[]> {
  const agents = await readAgentsFromDir(await getBuiltInAgentsDir());
  return agents
    .filter((agent): agent is ValidCustomAgentFile =>
      isValidCustomAgentFile(agent),
    )
    .map((agent) => ({ ...agent, isBuiltIn: true }));
}

export async function loadAgents(
  workingDirectory?: string,
  includeSystemAgents = true,
): Promise<ValidCustomAgentFile[]> {
  try {
    const allAgents: CustomAgentFile[] = [...(await loadBuiltInAgents())];

    if (workingDirectory) {
      const projectAgentsDir = path.join(workingDirectory, ".pochi", "agents");
      const projectAgents = await readAgentsFromDir(projectAgentsDir);
      allAgents.push(
        ...projectAgents.map((x) => ({
          ...x,
          filePath: path.relative(workingDirectory, x.filePath),
        })),
      );
    }

    if (includeSystemAgents) {
      const systemAgentsDir = path.join(os.homedir(), ".pochi", "agents");
      const systemAgents = await readAgentsFromDir(systemAgentsDir);
      allAgents.push(
        ...systemAgents.map((x) => ({
          ...x,
          filePath: x.filePath.replace(os.homedir(), "~"),
        })),
      );
    }

    const validAgents = uniqueBy(allAgents, (agent) => agent.name).filter(
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

export function getModelFromCustomAgent(agent: CustomAgent | undefined) {
  return agent?.model;
}
