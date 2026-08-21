import { prompts } from "@getpochi/common";
import { serializeCustomAgentMention } from "@getpochi/common/agent-mention";
import {
  type CustomAgentFile,
  type SkillFile,
  type ValidSkillFile,
  isValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import { isUserInvocableSkill } from "@getpochi/tools";

const MaxChainedSlashCommands = 6;

interface SlashCommandReference {
  name: string;
  start: number;
  end: number;
}

/**
 * Extract a chain of slash commands from the start of a prompt.
 * Text after the first non-command token is treated as command arguments.
 */
function extractLeadingSlashCommandReferences(
  prompt: string,
): SlashCommandReference[] {
  const references: SlashCommandReference[] = [];
  let cursor = 0;

  while (cursor < prompt.length && /\s/.test(prompt[cursor])) {
    cursor += 1;
  }

  while (references.length < MaxChainedSlashCommands) {
    const match = prompt.slice(cursor).match(/^\/(\w[\w-]*)(?=\s|$)/);
    if (!match) {
      break;
    }

    const end = cursor + match[0].length;
    references.push({ name: match[1], start: cursor, end });
    cursor = end;

    while (cursor < prompt.length && /\s/.test(prompt[cursor])) {
      cursor += 1;
    }
  }

  return references;
}

export function containsSlashCommandReference(prompt: string): boolean {
  return extractLeadingSlashCommandReferences(prompt).length > 0;
}

export function extractSlashCommandNames(prompt: string): string[] {
  return [
    ...new Set(
      extractLeadingSlashCommandReferences(prompt).map(
        (reference) => reference.name,
      ),
    ),
  ];
}

export async function replaceSlashCommandReferences(
  prompt: string,
  slashCommandContext: {
    customAgents: CustomAgentFile[];
    skills: SkillFile[];
  },
): Promise<{
  prompt: string;
  blockedSkill?: ValidSkillFile;
  invokedCustomAgents: string[];
}> {
  const references = extractLeadingSlashCommandReferences(prompt);
  if (references.length === 0) {
    return { prompt, invokedCustomAgents: [] };
  }

  let blockedSkill: ValidSkillFile | undefined;
  const invokedCustomAgents = new Set<string>();
  const resultParts: string[] = [];
  let cursor = 0;

  for (const reference of references) {
    const agent = slashCommandContext.customAgents.find(
      (candidate) => candidate.name === reference.name,
    );
    const skill = slashCommandContext.skills.find(
      (candidate) =>
        candidate.name === reference.name && isValidSkillFile(candidate),
    );

    if (!agent && !skill) {
      break;
    }

    resultParts.push(prompt.slice(cursor, reference.start));

    if (agent?.name) {
      invokedCustomAgents.add(agent.name);
      resultParts.push(serializeCustomAgentMention(agent.name, agent.filePath));
    } else if (
      skill &&
      isValidSkillFile(skill) &&
      !isUserInvocableSkill(skill)
    ) {
      blockedSkill ??= skill;
      resultParts.push(prompt.slice(reference.start, reference.end));
    } else if (skill && isValidSkillFile(skill)) {
      resultParts.push(prompts.skill(skill));
    }

    cursor = reference.end;
  }

  resultParts.push(prompt.slice(cursor));

  return {
    prompt: resultParts.join(""),
    blockedSkill,
    invokedCustomAgents: [...invokedCustomAgents],
  };
}
