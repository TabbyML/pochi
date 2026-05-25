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

    const skill = skills.find((s) => s.name === skillName);
    if (!skill) {
      const availableSkills = skills.map((s) => s.name).join(", ");
      throw new Error(
        `Skill '${skillName}' not found. Available skills: ${availableSkills}`,
      );
    }

    let resolvedFilePath: string;
    if (path.isAbsolute(skill.filePath)) {
      resolvedFilePath = skill.filePath;
    } else if (skill.filePath.startsWith("~")) {
      resolvedFilePath = skill.filePath.replace("~", os.homedir());
    } else {
      resolvedFilePath = path.resolve(workspaceDir, skill.filePath);
    }

    await fs.access(resolvedFilePath);

    return {
      result: prompts.createUseSkillResult(skill),
      _meta: {
        filePath: resolvedFilePath,
      },
    };
  };
