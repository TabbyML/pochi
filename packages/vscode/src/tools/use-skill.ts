import { getLogger, prompts } from "@getpochi/common";
import {
  type ClientTools,
  type ToolFunctionType,
  isModelInvocableSkill,
} from "@getpochi/tools";
import { container } from "tsyringe";
import { SkillManager } from "../lib/skill-manager";

const logger = getLogger("useSkill");

/**
 * Implements the useSkill tool for VSCode extension.
 * Returns skill instructions when a skill is activated by the model.
 */
export const useSkill: ToolFunctionType<ClientTools["useSkill"]> = async (
  args,
) => {
  const skillManager = container.resolve(SkillManager);
  const skills = skillManager.validSkills.value;

  // Find the requested skill
  const skill = skills.find((s) => s.name === args.skill);

  if (skill?.disableModelInvocation) {
    throw new Error(
      `Skill "${args.skill}" cannot be used with the useSkill tool because model invocation is disabled.`,
    );
  }
  if (!skill) {
    throw new Error(
      `Skill "${args.skill}" not found. Available skills: ${skills
        .filter(isModelInvocableSkill)
        .map((s) => s.name)
        .join(", ")}`,
    );
  }

  logger.debug(`Activating skill: ${skill.name}`);

  return {
    result: prompts.createUseSkillResult(skill),
    _meta: { filePath: skill.filePath },
  };
};
