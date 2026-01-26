import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { prompts } from "@getpochi/common";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

export const useSkill =
  (options: ToolCallOptions): ToolFunctionType<ClientTools["useSkill"]> =>
  async ({ skill: skillName }, { cwd: workspaceDir }) => {
    if (!skillName) {
      throw new Error("Skill name is required.");
    }

    const skills = options.skills;
    if (!skills || skills.length === 0) {
      throw new Error("No skills are available in the workspace.");
    }

    // Find the requested skill
    const skill = skills.find((s) => s.name === skillName);
    if (!skill) {
      const availableSkills = skills.map((s) => s.name).join(", ");
      throw new Error(
        `Skill '${skillName}' not found. Available skills: ${availableSkills}`,
      );
    }

    // Resolve the file path
    let resolvedFilePath: string;
    if (path.isAbsolute(skill.filePath)) {
      resolvedFilePath = skill.filePath;
    } else if (skill.filePath.startsWith("~")) {
      resolvedFilePath = skill.filePath.replace("~", os.homedir());
    } else {
      resolvedFilePath = path.resolve(workspaceDir, skill.filePath);
    }

    try {
      // Verify the file still exists
      await fs.access(resolvedFilePath);

      // Return the skill instructions
      return {
        result: prompts.createUseSkillResult(skill),
        filePath: resolvedFilePath,
      };
    } catch (error) {
      throw new Error(
        `Failed to access skill file at ${resolvedFilePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
