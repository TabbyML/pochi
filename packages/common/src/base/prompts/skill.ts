import type { Skill } from "@getpochi/tools";

export function createSkillPrompt(id: string, path: string) {
  // Remove extra newlines from the id
  let processedSkillName = id.replace(/\n+/g, "\n");
  // Escape '<' to avoid </skill> being interpreted as a closing tag
  const skillTagRegex = /<\/?skill\b[^>]*>/g;
  processedSkillName = processedSkillName.replace(skillTagRegex, (match) => {
    return match.replace("<", "&lt;");
  });
  return `<skill id="${id}" path="${path}">Please use the useSkill tool to run ${processedSkillName} to complete the following request:\n</skill>`;
}

/**
 * Creates the result for useSkill tool that includes skill instructions and tool restrictions
 */
export function createUseSkillResult(skill: Skill): string {
  let prompt = skill.instructions.trim();

  // If the skill has allowed tools, add tool restriction instructions
  if (skill.allowedTools?.trim()) {
    prompt = `IMPORTANT: This skill is restricted to use only the following tools: ${skill.allowedTools.trim()}

You must ONLY use these approved tools when executing this skill. Do not use any other tools that are not explicitly listed above.

${prompt}`;
  }

  return prompt;
}
