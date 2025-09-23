import * as os from "node:os";
import * as path from "node:path";
import { getWorkspaceFolder } from "@/lib/fs";
import { getLogger } from "@getpochi/common";
import { parseAgentFile } from "@getpochi/common/tool-utils";
import type { CustomAgentFile } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

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

@injectable()
@singleton()
export class CustomAgentManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  readonly agents = signal<CustomAgentFile[]>([]);

  constructor() {
    this.initWatchers();
    this.loadAgents();
  }

  private initWatchers() {
    try {
      // Watch workspace .pochi/agents directory
      const workspaceDir = getWorkspaceFolder();
      if (workspaceDir) {
        const projectAgentsPattern = new vscode.RelativePattern(
          workspaceDir,
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
      const workspaceDir = getWorkspaceFolder();
      const projectAgentsDir = path.join(
        workspaceDir.uri.fsPath,
        ".pochi",
        "agents",
      );
      const systemAgentsDir = path.join(os.homedir(), ".pochi", "agents");

      const allAgents: CustomAgentFile[] = [];

      if (projectAgentsDir) {
        allAgents.push(...(await readAgentsFromDir(projectAgentsDir)));
      }
      allAgents.push(...(await readAgentsFromDir(systemAgentsDir)));

      this.agents.value = allAgents;
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
