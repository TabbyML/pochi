import type {
  ValidCustomAgentFile,
  ValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import {
  Skill,
  isUserInvocableSkill,
  makeUserInvocationDisabledMessage,
} from "@getpochi/tools";
import type { JSONContent } from "@tiptap/react";
import type { ChatInput } from "./use-chat-input-state";

const IgnoredNodeTypes = new Set(["codeBlock"]);

interface SkillMentionReference {
  name: string;
  rawData?: Skill;
}

interface InvocationReferences {
  skillMentions: SkillMentionReference[];
  customAgentMentions: string[];
}

export type SlashMentionResolutionResult =
  | {
      status: "valid";
      text: string;
      invokedSkills: ValidSkillFile[];
      invokedCustomAgents: string[];
    }
  | { status: "blocked"; message: string };

function collectInvocationReferences(json: JSONContent): InvocationReferences {
  const skillMentions: SkillMentionReference[] = [];
  const customAgentMentions: string[] = [];

  function visit(node: JSONContent) {
    if (IgnoredNodeTypes.has(node.type ?? "")) {
      return;
    }

    if (node.type === "slashMention" && typeof node.attrs?.id === "string") {
      if (node.attrs.type === "skill") {
        skillMentions.push({
          name: node.attrs.id,
          rawData: node.attrs.rawData as Skill | undefined,
        });
        return;
      }
      if (node.attrs.type === "custom-agent") {
        customAgentMentions.push(node.attrs.id);
        return;
      }
    }

    for (const child of node.content ?? []) {
      visit(child);
    }
  }

  visit(json);
  return { skillMentions, customAgentMentions };
}

export function resolveSlashMentions(
  input: ChatInput,
  skills: ValidSkillFile[],
  customAgents: ValidCustomAgentFile[] = [],
): SlashMentionResolutionResult {
  const references = input.json
    ? collectInvocationReferences(input.json)
    : { skillMentions: [], customAgentMentions: [] };

  const invokedSkills = new Map<string, ValidSkillFile>();
  const invokedCustomAgents = new Set<string>();

  for (const mention of references.skillMentions) {
    const skill = skills.find((candidate) => candidate.name === mention.name);
    if (!skill) {
      return {
        status: "blocked",
        message: `Skill "${mention.name}" is no longer available. Remove or reselect the slash command.`,
      };
    }
    if (!isUserInvocableSkill(skill)) {
      return {
        status: "blocked",
        message: makeUserInvocationDisabledMessage(skill),
      };
    }

    const staleSkill = Skill.safeParse(mention.rawData);
    if (!staleSkill.success) {
      return {
        status: "blocked",
        message: `Skill "${mention.name}" is no longer available. Remove or reselect the slash command.`,
      };
    }
    invokedSkills.set(skill.name, skill);
  }

  for (const name of references.customAgentMentions) {
    const customAgent = customAgents.find(
      (candidate) => candidate.name === name,
    );
    if (!customAgent) {
      return {
        status: "blocked",
        message: `Agent "${name}" is no longer available. Remove or reselect the slash command.`,
      };
    }
    invokedCustomAgents.add(customAgent.name);
  }

  return {
    status: "valid",
    text: input.text,
    invokedSkills: [...invokedSkills.values()],
    invokedCustomAgents: [...invokedCustomAgents],
  };
}
