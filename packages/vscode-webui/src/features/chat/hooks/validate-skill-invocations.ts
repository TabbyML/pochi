import { prompts } from "@getpochi/common";
import type { ValidSkillFile } from "@getpochi/common/vscode-webui-bridge";
import {
  Skill,
  isUserInvocableSkill,
  makeUserInvocationDisabledMessage,
} from "@getpochi/tools";
import type { JSONContent } from "@tiptap/react";
import type { ChatInput } from "./use-chat-input-state";

const SlashCommandPattern = /\/\w+[\w-]*/g;
const IgnoredNodeTypes = new Set(["codeBlock"]);
const IgnoredMarkTypes = new Set(["code", "link"]);

interface SkillMentionReference {
  name: string;
  rawData?: Skill;
}

interface SkillInvocationReferences {
  mentions: SkillMentionReference[];
  textCommands: string[];
}

export type SkillInvocationValidationResult =
  | { status: "valid"; text: string }
  | { status: "blocked"; message: string };

function extractSlashCommands(text: string): string[] {
  return [...text.matchAll(SlashCommandPattern)].map((match) =>
    match[0].substring(1),
  );
}

function collectSkillInvocationReferences(
  json: JSONContent,
): SkillInvocationReferences {
  const mentions: SkillMentionReference[] = [];
  const textCommands: string[] = [];

  function visit(node: JSONContent) {
    if (IgnoredNodeTypes.has(node.type ?? "")) {
      return;
    }

    if (
      node.type === "slashMention" &&
      node.attrs?.type === "skill" &&
      typeof node.attrs.id === "string"
    ) {
      mentions.push({
        name: node.attrs.id,
        rawData: node.attrs.rawData as Skill | undefined,
      });
      return;
    }

    const hasIgnoredMark = node.marks?.some((mark) =>
      IgnoredMarkTypes.has(mark.type ?? ""),
    );
    if (typeof node.text === "string" && !hasIgnoredMark) {
      textCommands.push(...extractSlashCommands(node.text));
    }

    for (const child of node.content ?? []) {
      visit(child);
    }
  }

  visit(json);
  return { mentions, textCommands };
}

export function validateSkillInvocations(
  input: ChatInput,
  skills: ValidSkillFile[],
): SkillInvocationValidationResult {
  const references = input.json
    ? collectSkillInvocationReferences(input.json)
    : {
        mentions: [],
        textCommands: extractSlashCommands(input.text),
      };

  let text = input.text;

  for (const mention of references.mentions) {
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
    text = text.replace(prompts.skill(staleSkill.data), prompts.skill(skill));
  }

  for (const name of references.textCommands) {
    const skill = skills.find((candidate) => candidate.name === name);
    if (skill && !isUserInvocableSkill(skill)) {
      return {
        status: "blocked",
        message: makeUserInvocationDisabledMessage(skill),
      };
    }
  }

  return { status: "valid", text };
}
