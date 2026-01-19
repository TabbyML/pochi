import type { Skill } from "@getpochi/tools";

/**
 * Valid skill with file path information
 */
export interface ValidSkillFile extends Skill {
  /**
   * The file system path where this skill is defined
   */
  filePath: string;
}

export interface InvalidSkillFile extends Partial<Skill> {
  /**
   * The name of the custom agent
   */
  name: string;
  /**
   * The file system path where this custom agent is defined
   */
  filePath: string;
  /**
   * The type of error encountered while processing the custom agent file
   */
  error: "readError" | "parseError" | "validationError";
  /**
   * Detailed error message
   */
  message: string;
}

export type SkillFile = ValidSkillFile | InvalidSkillFile;

export const isValidSkill = (
  skill: Skill | SkillFile,
): skill is ValidSkillFile => {
  return (
    (skill as ValidSkillFile).name !== undefined &&
    (skill as ValidSkillFile).description !== undefined &&
    (skill as ValidSkillFile).instructions !== undefined &&
    !(skill as InvalidSkillFile).error
  );
};
