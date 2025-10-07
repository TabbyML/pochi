import * as os from "node:os";
import * as path from "node:path";
import { getLogger } from "@getpochi/common";
import { parseAgentFile } from "@getpochi/common/tool-utils";
import type { CustomAgentFile } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { uniqueBy } from "remeda";
import { Lifecycle, inject, injectable, scoped } from "tsyringe";
import * as vscode from "vscode";
import type { WorkspaceScope } from "./workspace-scoped";

const logger = getLogger("CustomAgentManager");

/**
 * Read custom agents from a directory
 */
async function readAgentsFromDir(dir: string): Promise<CustomAgentFile[]> {
  const agents: CustomAgentFile[] = [];
  try {
    const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dir));
    for (const [fileName] of files) {
      if (fileName.endsWith(".md")) {
        const filePath = path.join(dir, fileName);
        const readFileContent = async (filePath: string): Promise<string> => {
          const fileContent = await vscode.workspace.fs.readFile(
            vscode.Uri.file(filePath),
          );
          return new TextDecoder().decode(fileContent);
        };
        const agent = await parseAgentFile(filePath, readFileContent);
        agents.push(agent);
      }
    }
  } catch (error) {
    // Directory may not exist, which is fine.
    logger.debug(`Could not read agents from directory ${dir}:`, error);
  }
  return agents;
}

@scoped(Lifecycle.ContainerScoped)
@injectable()
export class CustomAgentManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  readonly agents = signal<CustomAgentFile[]>([]);

  constructor(
    @inject("WorkspaceScope") private readonly workspaceScope: WorkspaceScope,
  ) {
    this.initWatchers();
    this.loadAgents();
  }

  private get cwd() {
    return this.workspaceScope.cwd;
  }

  private initWatchers() {
    try {
      if (this.cwd) {
        const projectAgentsPattern = new vscode.RelativePattern(
          this.cwd,
          ".pochi/agents/**/*.md",
        );
        const projectWatcher =
          vscode.workspace.createFileSystemWatcher(projectAgentsPattern);

        projectWatcher.onDidCreate(() => this.loadAgents());
        projectWatcher.onDidChange(() => this.loadAgents());
        projectWatcher.onDidDelete(() => this.loadAgents());

        this.disposables.push(projectWatcher);
      }
    } catch (error) {
      logger.error("Failed to initialize project agents watcher", error);
    }

    try {
      // Watch system .pochi/agents directory
      const systemAgentsDir = path.join(os.homedir(), ".pochi", "agents");
      const systemAgentsPattern = new vscode.RelativePattern(
        systemAgentsDir,
        "**/*.md",
      );
      const systemWatcher =
        vscode.workspace.createFileSystemWatcher(systemAgentsPattern);

      systemWatcher.onDidCreate(() => this.loadAgents());
      systemWatcher.onDidChange(() => this.loadAgents());
      systemWatcher.onDidDelete(() => this.loadAgents());

      this.disposables.push(systemWatcher);
    } catch (error) {
      logger.error("Failed to initialize system agents watcher", error);
    }
  }

  private async loadAgents() {
    try {
      const allAgents: CustomAgentFile[] = [];
      if (this.cwd) {
        const projectAgentsDir = path.join(this.cwd, ".pochi", "agents");
        allAgents.push(...(await readAgentsFromDir(projectAgentsDir)));
      }
      const systemAgentsDir = path.join(os.homedir(), ".pochi", "agents");

      allAgents.push(...(await readAgentsFromDir(systemAgentsDir)));

      this.agents.value = uniqueBy(allAgents, (agent) => agent.name);
      logger.debug(`Loaded ${allAgents.length} custom agents`);
    } catch (error) {
      logger.error("Failed to load custom agents", error);
      this.agents.value = [];
    }
  }

  dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
