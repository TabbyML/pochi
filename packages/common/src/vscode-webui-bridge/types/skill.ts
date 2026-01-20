import type { Skill } from "@getpochi/tools";

export type ValidSkillFile = Skill;

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
