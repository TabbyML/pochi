import * as os from "node:os";
import * as path from "node:path";
import { getLogger } from "@getpochi/common";
import { parseSkillFile } from "@getpochi/common/tool-utils";
import {
  type SkillFile,
  type ValidSkillFile,
  isValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { uniqueBy } from "remeda";
import { Lifecycle, injectable, scoped } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceScope } from "./workspace-scoped";

const logger = getLogger("SkillManager");

/**
 * Read skills from a directory
 * Expects directory structure: skills/skill-name/SKILL.md
 */
async function readSkillsFromDir(dir: string): Promise<SkillFile[]> {
  const skills: SkillFile[] = [];
  try {
    const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    for (const [fileName, fileType] of files) {
      // Look for subdirectories (skill directories)
      if (fileType === vscode.FileType.Directory) {
        const skillDir = path.join(dir, fileName);
        const skillFilePath = path.join(skillDir, "SKILL.md");

        try {
          // Check if SKILL.md exists in this subdirectory
          const stat = await vscode.workspace.fs.stat(
            vscode.Uri.file(skillFilePath),
          );
          if (stat.type === vscode.FileType.File) {
            const readFileContent = async (
              filePath: string,
            ): Promise<string> => {
              const fileContent = await vscode.workspace.fs.readFile(
                vscode.Uri.file(filePath),
              );
              return new TextDecoder().decode(fileContent);
            };
            const skill = await parseSkillFile(skillFilePath, readFileContent);
            skills.push(skill);
          }
        } catch (error) {
          // SKILL.md doesn't exist in this directory, skip it
          logger.debug(`No SKILL.md found in ${skillDir}:`, error);
        }
      }
    }
  } catch (error) {
    // Directory may not exist, which is fine.
    logger.debug(`Could not read skills from directory ${dir}:`, error);
  }
  return skills;
}

@scoped(Lifecycle.ContainerScoped)
@injectable()
export class SkillManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  readonly allSkills = signal<SkillFile[]>([]);
  readonly validSkills = signal<ValidSkillFile[]>([]);

  constructor(private readonly workspaceScope: WorkspaceScope) {
    this.initWatchers();
    this.loadSkills();
  }

  private get cwd() {
    return this.workspaceScope.cwd;
  }

  private initWatchers() {
    try {
      if (this.cwd) {
        const projectSkillsPattern = new vscode.RelativePattern(
          this.cwd,
          ".pochi/skills/*/SKILL.md",
        );
        const projectWatcher =
          vscode.workspace.createFileSystemWatcher(projectSkillsPattern);

        projectWatcher.onDidCreate(() => this.loadSkills());
        projectWatcher.onDidChange(() => this.loadSkills());
        projectWatcher.onDidDelete(() => this.loadSkills());

        this.disposables.push(projectWatcher);
      }
    } catch (error) {
      logger.error("Failed to initialize project skills watcher", error);
    }

    try {
      // Watch system .pochi/skills directory
      const systemSkillsDir = path.join(os.homedir(), ".pochi", "skills");
      const systemSkillsPattern = new vscode.RelativePattern(
        systemSkillsDir,
        "*/SKILL.md",
      );
      const systemWatcher =
        vscode.workspace.createFileSystemWatcher(systemSkillsPattern);

      systemWatcher.onDidCreate(() => this.loadSkills());
      systemWatcher.onDidChange(() => this.loadSkills());
      systemWatcher.onDidDelete(() => this.loadSkills());

      this.disposables.push(systemWatcher);
    } catch (error) {
      logger.error("Failed to initialize system skills watcher", error);
    }
  }

  private async loadSkills() {
    try {
      const allSkills: SkillFile[] = [];
      if (this.cwd) {
        const projectSkillsDir = path.join(this.cwd, ".pochi", "skills");
        const cwd = this.cwd;
        const projectSkills = await readSkillsFromDir(projectSkillsDir);
        allSkills.push(
          ...projectSkills.map((x) => ({
            ...x,
            filePath: path.relative(cwd, x.filePath),
          })),
        );
      }

      const systemSkillsDir = path.join(os.homedir(), ".pochi", "skills");
      const systemSkills = await readSkillsFromDir(systemSkillsDir);
      allSkills.push(
        ...systemSkills.map((x) => ({
          ...x,
        })),
      );

      this.allSkills.value = uniqueBy(allSkills, (skill) => skill.name);
      this.validSkills.value = this.allSkills.value.filter(isValidSkillFile);
      logger.debug(`Loaded ${allSkills.length} skills`);
    } catch (error) {
      logger.error("Failed to load skills", error);
      this.allSkills.value = [];
      this.validSkills.value = [];
    }
  }

  dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
