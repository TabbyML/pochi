import type { Skill } from "@getpochi/tools";
import { createSkill } from "./create-skill";
import { findSkills } from "./find-skills";

export const BuiltInSkillPath = "_builtIn_";

export const builtInSkills: Skill[] = [findSkills, createSkill];
