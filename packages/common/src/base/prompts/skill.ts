import type { Skill } from "@getpochi/tools";

export function createSkillPrompt(skill: Skill) {
  const instructions = createUseSkillResult(skill).replace(
    /<\/?skill\b[^>]*>/g,
    (match) => match.replace("<", "&lt;"),
  );
  return `<skill id="${skill.name}" path="${skill.filePath}" data-user-invoked="true">
The user invoked this skill directly, so its instructions are already active. Do not call the useSkill tool for "${skill.name}"; follow the instructions below directly.

${instructions}
</skill>`;
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
