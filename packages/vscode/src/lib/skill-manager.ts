import * as os from "node:os";
import * as path from "node:path";
import { BuiltInSkillPath, builtInSkills, getLogger } from "@getpochi/common";
import { parseSkillFile } from "@getpochi/common/tool-utils";
import {
  type SkillFile,
  isValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import { computed, signal } from "@preact/signals-core";
import { funnel, uniqueBy } from "remeda";
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
      if (
        fileType & vscode.FileType.Directory ||
        fileType & vscode.FileType.SymbolicLink
      ) {
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

  readonly skills = signal<SkillFile[]>([]);
  readonly validSkills = computed(() =>
    this.skills.value.filter(isValidSkillFile),
  );

  constructor(private readonly workspaceScope: WorkspaceScope) {
    this.initWatchers();
    this.loadSkills();
  }

  private get cwd() {
    return this.workspaceScope.cwd;
  }

  /**
   * Creates watchers for a skills directory anchored at a base directory.
   * Three watchers are created:
   * 1. "{prefix}/STAR/SKILL.md" - fires on file create/change/delete
   * 2. "{prefix}/STAR" - fires on skill folder create/delete (directory
   *    removal does not propagate a delete event to contained files on all
   *    platforms, so this is required to reliably catch folder deletions)
   * 3. "{prefix}" - fires on the skills parent directory itself being
   *    created/deleted (e.g. when the entire .pochi folder is removed)
   */
  private watchSkillsDir(base: string, prefix: string) {
    const baseUri = vscode.Uri.file(base);

    const fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(baseUri, `${prefix}/*/SKILL.md`),
    );
    fileWatcher.onDidCreate(() => this.scheduleReload.call());
    fileWatcher.onDidChange(() => this.scheduleReload.call());
    fileWatcher.onDidDelete(() => this.scheduleReload.call());
    this.disposables.push(fileWatcher);

    const dirWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(baseUri, `${prefix}/*`),
    );
    dirWatcher.onDidCreate(() => this.scheduleReload.call());
    dirWatcher.onDidDelete(() => this.scheduleReload.call());
    this.disposables.push(dirWatcher);

    // Watch the skills directory itself so that deleting a parent directory
    // (e.g. the entire .pochi folder) also triggers a reload.
    const parentWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(baseUri, prefix),
    );
    parentWatcher.onDidCreate(() => this.scheduleReload.call());
    parentWatcher.onDidDelete(() => this.scheduleReload.call());
    this.disposables.push(parentWatcher);

    // Watch the root directory of the skills path (e.g. .pochi or .agents)
    // to catch when the entire folder is deleted.
    const rootDir = prefix.split("/")[0];
    if (rootDir && rootDir !== prefix) {
      const rootWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(baseUri, rootDir),
      );
      rootWatcher.onDidCreate(() => this.scheduleReload.call());
      rootWatcher.onDidDelete(() => this.scheduleReload.call());
      this.disposables.push(rootWatcher);
    }
  }

  private initWatchers() {
    try {
      if (this.cwd) {
        this.watchSkillsDir(this.cwd, ".pochi/skills");
        this.watchSkillsDir(this.cwd, ".agents/skills");
      }
    } catch (error) {
      logger.error("Failed to initialize project skills watcher", error);
    }

    try {
      this.watchSkillsDir(os.homedir(), ".pochi/skills");
    } catch (error) {
      logger.error("Failed to initialize system skills watcher", error);
    }

    try {
      this.watchSkillsDir(os.homedir(), ".agents/skills");
    } catch (error) {
      logger.error("Failed to initialize global .agents/skills watcher", error);
    }
  }

  /**
   * Debounced reload — coalesces rapid successive watcher events (e.g. when
   * a directory is deleted along with its contents) into a single scan after
   * a short settle delay. The delay also ensures the FS has fully committed
   * the change before we re-read it.
   */
  private readonly scheduleReload = funnel(() => this.loadSkills(), {
    triggerAt: "end",
    minQuietPeriodMs: 200,
  });

  private async loadSkills() {
    try {
      const allSkills: SkillFile[] = [
        ...builtInSkills.map((skill) => ({
          ...skill,
          filePath: BuiltInSkillPath,
        })),
      ];
      if (this.cwd) {
        const cwd = this.cwd;

        const projectSkillsDir = path.join(cwd, ".pochi", "skills");
        const projectSkills = await readSkillsFromDir(projectSkillsDir);
        allSkills.push(
          ...projectSkills.map((x) => ({
            ...x,
            filePath: path.relative(cwd, x.filePath),
          })),
        );

        // Load project-level .agents/skills (lower priority than .pochi/skills)
        const projectAgentsSkillsDir = path.join(cwd, ".agents", "skills");
        const projectAgentsSkills = await readSkillsFromDir(
          projectAgentsSkillsDir,
        );
        allSkills.push(
          ...projectAgentsSkills.map((x) => ({
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
        })),
      );

      this.skills.value = uniqueBy(allSkills, (skill) =>
        skill.filePath === BuiltInSkillPath
          ? skill.name + BuiltInSkillPath
          : skill.name,
      );
      logger.debug(`Loaded ${allSkills.length} skills`);
    } catch (error) {
      logger.error("Failed to load skills", error);
      this.skills.value = [];
    }
  }

  dispose() {
    this.scheduleReload.cancel();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
