import { prompts } from "@getpochi/common";
import type { CustomAgentFile } from "@getpochi/common/vscode-webui-bridge";
import type { CustomAgent } from "@getpochi/tools";
import { getModelFromCustomAgent } from "./load-agents";
import { type Workflow, getModelFromWorkflow } from "./workflow-loader";

export function containsSlashCommandReference(prompt: string): boolean {
  return /\/\w+[\w-]*/.test(prompt);
}

export function extractSlashCommandNames(prompt: string): string[] {
  const slashCommandRegex = /(\/\w+[\w-]*)/g;
  const matches = prompt.match(slashCommandRegex);
  if (!matches) return [];

  return matches.map((match) => match.substring(1)); // Remove the leading "/"
}

export async function getModelFromSlashCommand(
  prompt: string | undefined,
  options: {
    workflows: Workflow[];
    customAgents: CustomAgent[];
  },
): Promise<string | undefined> {
  if (prompt && containsSlashCommandReference(prompt)) {
    const commandNames = extractSlashCommandNames(prompt);

    if (!commandNames.length) {
      return undefined;
    }

    for (const commandName of commandNames) {
      // 1. try to get model from workflow
      const targetWorkflow = options.workflows.find(
        (w) => w.id === commandName,
      );

      const workflowModel = getModelFromWorkflow(targetWorkflow);
      if (workflowModel) {
        return workflowModel;
      }

      // 2. try to get model from agent
      const targetAgent = options.customAgents.find(
        (x) => x.name === commandName,
      );
      const agentModel = getModelFromCustomAgent(targetAgent);
      if (agentModel) {
        return agentModel;
      }
    }
  }
  return undefined;
}

export async function replaceSlashCommandReferences(
  prompt: string,
  slashCommandContext: {
    workflows: Workflow[];
    customAgents: CustomAgentFile[];
  },
): Promise<{ prompt: string }> {
  const commandNames = extractSlashCommandNames(prompt);

  if (commandNames.length === 0) {
    return { prompt };
  }
  let result = prompt;
  // Process each workflow reference
  for (const id of commandNames) {
    const workflow = slashCommandContext.workflows.find((x) => x.id === id);
    if (workflow?.content) {
      result = result.replace(
        `/${id}`,
        prompts.workflow(id, workflow.pathName, workflow.content),
      );
    }

    const agent = slashCommandContext.customAgents.find((x) => x.name === id);
    if (agent?.name) {
      result = result.replace(
        `/${id}`,
        prompts.customAgent(id, agent.filePath),
      );
    }
  }

  return { prompt: result };
}
