import { getLogger } from "@getpochi/common";
import { isValidSkillFile } from "@getpochi/common/vscode-webui-bridge";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import { container } from "tsyringe";
import { SkillManager } from "../lib/skill-manager";

const logger = getLogger("useSkill");

/**
 * Implements the useSkill tool for VSCode extension.
 * Returns skill instructions when a skill is activated by the model.
 */
export const skill: ToolFunctionType<ClientTools["skill"]> = async (args) => {
  try {
    const skillManager = container.resolve(SkillManager);
    const skills = skillManager.skills.value;

    // Find the requested skill
    const skill = skills.find((s) => s.name === args.skill);

    if (!skill) {
      return {
        result: `Skill "${args.skill}" not found. Available skills: ${skills
          .map((s) => s.name)
          .join(", ")}`,
      };
    }

    // Check if skill is valid
    if (!isValidSkillFile(skill)) {
      const invalidSkill = skill as { message?: string };
      return {
        result: `Skill "${args.skill}" is invalid: ${
          invalidSkill.message || "Unknown error"
        }`,
      };
    }

    logger.debug(`Activating skill: ${skill.name}`);

    return {
      result: skill.instructions.trim(),
    };
  } catch (error) {
    logger.error("Error in useSkill tool:", error);
    return {
      result: `Failed to activate skill: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
};
