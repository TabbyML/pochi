import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { getLogger } from "@getpochi/common";
import { isFileExists, parseSkillFile } from "@getpochi/common/tool-utils";
import type {
  SkillFile,
  ValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import { isValidSkillFile } from "@getpochi/common/vscode-webui-bridge";
import { uniqueBy } from "remeda";
import { getBuiltInSkillsDir } from "./builtin-skills-dir";

const logger = getLogger("loadSkills");

/**
 * Read skills from a directory.
 *
 * Two layouts are supported:
 *   - `<dir>/<skill>.md`            (flat, used for single-file skills)
 *   - `<dir>/<skill>/SKILL.md`      (folder, when the skill ships extra files)
 */
async function readSkillsFromDir(dir: string): Promise<SkillFile[]> {
  const skills: SkillFile[] = [];
  const readFileContent = async (filePath: string) =>
    await fs.readFile(filePath, "utf-8");

  try {
    if (!(await isFileExists(dir))) {
      return skills;
    }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        const skillFilePath = path.join(dir, entry.name, "SKILL.md");
        try {
          const stat = await fs.stat(skillFilePath);
          if (stat.isFile()) {
            const skill = await parseSkillFile(skillFilePath, readFileContent);
            skills.push({ ...skill, filePath: skillFilePath });
          }
        } catch (error) {
          logger.debug(`No SKILL.md found in ${entry.name}:`, error);
        }
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const skillFilePath = path.join(dir, entry.name);
        const skill = await parseSkillFile(skillFilePath, readFileContent);
        skills.push({ ...skill, filePath: skillFilePath });
      }
    }
  } catch (error) {
    logger.debug(`Could not read skills from directory ${dir}:`, error);
  }
  return skills;
}

async function loadBuiltInSkills(): Promise<ValidSkillFile[]> {
  const skills = await readSkillsFromDir(await getBuiltInSkillsDir());
  return skills
    .filter((skill): skill is ValidSkillFile => isValidSkillFile(skill))
    .map((skill) => ({ ...skill, isBuiltIn: true }));
}

export async function loadSkills(
  workingDirectory?: string,
  includeSystemSkills = true,
): Promise<ValidSkillFile[]> {
  try {
    const allSkills: SkillFile[] = [...(await loadBuiltInSkills())];

    // Load project skills if working directory is provided
    if (workingDirectory) {
      const projectSkillsDir = path.join(workingDirectory, ".pochi", "skills");
      const projectSkills = await readSkillsFromDir(projectSkillsDir);
      allSkills.push(
        ...projectSkills.map((x) => ({
          ...x,
          filePath: path.relative(workingDirectory, x.filePath),
        })),
      );

      // Load project-level .agents/skills (lower priority than .pochi/skills)
      const projectAgentsSkillsDir = path.join(
        workingDirectory,
        ".agents",
        "skills",
      );
      const projectAgentsSkills = await readSkillsFromDir(
        projectAgentsSkillsDir,
      );
      allSkills.push(
        ...projectAgentsSkills.map((x) => ({
          ...x,
          filePath: path.relative(workingDirectory, x.filePath),
        })),
      );
    }

    // Load system skills
    if (includeSystemSkills) {
      const systemSkillsDir = path.join(os.homedir(), ".pochi", "skills");
      const systemSkills = await readSkillsFromDir(systemSkillsDir);
      allSkills.push(
        ...systemSkills.map((x) => ({
          ...x,
          filePath: x.filePath.replace(os.homedir(), "~"),
        })),
      );

      // Load global ~/.agents/skills (lower priority than ~/.pochi/skills)
      const systemAgentsSkillsDir = path.join(
        os.homedir(),
        ".agents",
        "skills",
      );
      const systemAgentsSkills = await readSkillsFromDir(systemAgentsSkillsDir);
      allSkills.push(
        ...systemAgentsSkills.map((x) => ({
          ...x,
          filePath: x.filePath.replace(os.homedir(), "~"),
        })),
      );
    }

    const validSkills = uniqueBy(allSkills, (skill) => skill.name).filter(
      (skill): skill is ValidSkillFile => {
        if (isValidSkillFile(skill)) {
          return true;
        }
        logger.warn(
          `Ignoring invalid skill file ${skill.filePath}: [${skill.error}] ${skill.message}`,
        );
        return false;
      },
    );

    logger.debug(
      `Loaded ${allSkills.length} skills (${validSkills.length} valid, ${allSkills.length - validSkills.length} invalid)`,
    );
    return validSkills;
  } catch (error) {
    logger.error("Failed to load skills", error);
    return [];
  }
}
