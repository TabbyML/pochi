import * as os from "node:os";
import * as path from "node:path";
import { getLogger } from "@getpochi/common";
import { parseAgentFile } from "@getpochi/common/tool-utils";
import {
  type CustomAgentFile,
  type ValidCustomAgentFile,
  isValidCustomAgentFile,
} from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { funnel, uniqueBy } from "remeda";
import { Lifecycle, inject, injectable, scoped } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "../integrations/configuration";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceScope } from "./workspace-scoped";

const logger = getLogger("CustomAgentManager");

async function readAgentsFromDir(dir: string): Promise<CustomAgentFile[]> {
  const agents: CustomAgentFile[] = [];
  const readFileContent = async (filePath: string): Promise<string> => {
    const fileContent = await vscode.workspace.fs.readFile(
      vscode.Uri.file(filePath),
    );
    return new TextDecoder().decode(fileContent);
  };

  try {
    const entries = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(dir),
    );
    for (const [entryName, entryType] of entries) {
      if (
        entryType & vscode.FileType.Directory ||
        entryType & vscode.FileType.SymbolicLink
      ) {
        const agentFilePath = path.join(dir, entryName, "AGENT.md");
        try {
          const stat = await vscode.workspace.fs.stat(
            vscode.Uri.file(agentFilePath),
          );
          if (stat.type === vscode.FileType.File) {
            const agent = await parseAgentFile(agentFilePath, readFileContent);
            agents.push(agent);
          }
        } catch (error) {
          logger.debug(`No AGENT.md found in ${entryName}:`, error);
        }
      } else if (
        entryType & vscode.FileType.File &&
        entryName.toLowerCase().endsWith(".md")
      ) {
        const agentFilePath = path.join(dir, entryName);
        const agent = await parseAgentFile(agentFilePath, readFileContent);
        agents.push(agent);
      }
    }
  } catch (error) {
    logger.debug(`Could not read agents from directory ${dir}:`, error);
  }
  return agents;
}

@scoped(Lifecycle.ContainerScoped)
@injectable()
export class CustomAgentManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  readonly agents = signal<CustomAgentFile[]>([]);

  private readonly builtInAgentsDir: string;

  constructor(
    private readonly workspaceScope: WorkspaceScope,
    private readonly configuration: PochiConfiguration,
    @inject("vscode.ExtensionContext")
    private readonly extensionContext: vscode.ExtensionContext,
  ) {
    this.builtInAgentsDir = path.join(
      this.extensionContext.extensionUri.fsPath,
      "assets",
      "agents",
    );
    this.initWatchers();
    this.loadAgents();

    this.disposables.push({
      dispose: this.configuration.advancedSettings.subscribe(() => {
        this.loadAgents();
      }),
    });
  }

  private get cwd() {
    return this.workspaceScope.cwd;
  }

  private watchAgentsDir(base: string, prefix: string) {
    const baseUri = vscode.Uri.file(base);

    const flatFileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(baseUri, `${prefix}/*.md`),
    );
    flatFileWatcher.onDidCreate(() => this.scheduleReload.call());
    flatFileWatcher.onDidChange(() => this.scheduleReload.call());
    flatFileWatcher.onDidDelete(() => this.scheduleReload.call());
    this.disposables.push(flatFileWatcher);

    const folderFileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(baseUri, `${prefix}/*/AGENT.md`),
    );
    folderFileWatcher.onDidCreate(() => this.scheduleReload.call());
    folderFileWatcher.onDidChange(() => this.scheduleReload.call());
    folderFileWatcher.onDidDelete(() => this.scheduleReload.call());
    this.disposables.push(folderFileWatcher);

    const dirWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(baseUri, `${prefix}/*`),
    );
    dirWatcher.onDidCreate(() => this.scheduleReload.call());
    dirWatcher.onDidDelete(() => this.scheduleReload.call());
    this.disposables.push(dirWatcher);

    const parentWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(baseUri, prefix),
    );
    parentWatcher.onDidCreate(() => this.scheduleReload.call());
    parentWatcher.onDidDelete(() => this.scheduleReload.call());
    this.disposables.push(parentWatcher);

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
        this.watchAgentsDir(path.join(this.cwd, ".pochi"), "agents");
      }
    } catch (error) {
      logger.error("Failed to initialize project agents watcher", error);
    }

    try {
      this.watchAgentsDir(path.join(os.homedir(), ".pochi"), "agents");
    } catch (error) {
      logger.error("Failed to initialize system agents watcher", error);
    }
  }

  private readonly scheduleReload = funnel(() => this.loadAgents(), {
    triggerAt: "end",
    minQuietPeriodMs: 200,
  });

  private async loadAgents() {
    try {
      const reviewAgentEnabled =
        this.configuration.advancedSettings.value.reviewAgent ?? false;

      const builtInAgentFiles = await readAgentsFromDir(this.builtInAgentsDir);
      const allAgents: CustomAgentFile[] = builtInAgentFiles
        .filter((agent) => {
          if (
            agent.name === "reviewer" &&
            isValidCustomAgentFile(agent as ValidCustomAgentFile) &&
            !reviewAgentEnabled
          ) {
            return false;
          }
          return true;
        })
        .map((agent) => ({ ...agent, isBuiltIn: true }));

      if (this.cwd) {
        const projectAgentsDir = path.join(this.cwd, ".pochi", "agents");
        const cwd = this.cwd;
        const projectAgents = await readAgentsFromDir(projectAgentsDir);
        allAgents.push(
          ...projectAgents.map((x) => ({
            ...x,
            filePath: path.relative(cwd, x.filePath),
          })),
        );
      }

      const systemAgentsDir = path.join(os.homedir(), ".pochi", "agents");
      const systemAgents = await readAgentsFromDir(systemAgentsDir);
      allAgents.push(
        ...systemAgents.map((x) => ({
          ...x,
          filePath: x.filePath.replace(os.homedir(), "~"),
        })),
      );

      this.agents.value = uniqueBy(allAgents, (agent) => agent.name);
      logger.debug(`Loaded ${allAgents.length} custom agents`);
    } catch (error) {
      logger.error("Failed to load custom agents", error);
      this.agents.value = [];
    }
  }

  dispose() {
    this.scheduleReload.cancel();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
