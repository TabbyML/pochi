import * as os from "node:os";
import {
  collectCustomRules,
  collectRuleFiles,
  collectWorkflows,
  copyThirdPartyRules,
  detectThirdPartyRules,
  getSystemInfo,
  getWorkspaceRulesFileUri,
} from "@/lib/env";
import { getWorkspaceFolder, isFileExists } from "@/lib/fs";

import path from "node:path";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { CustomAgentManager } from "@/lib/custom-agent";
import { getLogger } from "@/lib/logger";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { ModelList } from "@/lib/model-list";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PostHog } from "@/lib/posthog";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { UserStorage } from "@/lib/user-storage";
import { applyDiff, previewApplyDiff } from "@/tools/apply-diff";
import { executeCommand } from "@/tools/execute-command";
import { globFiles } from "@/tools/glob-files";
import { killBackgroundJob } from "@/tools/kill-background-job";
import { listFiles as listFilesTool } from "@/tools/list-files";
import {
  multiApplyDiff,
  previewMultiApplyDiff,
} from "@/tools/multi-apply-diff";
import { readBackgroundJobOutput } from "@/tools/read-background-job-output";
import { readFile } from "@/tools/read-file";
import { searchFiles } from "@/tools/search-files";
import { startBackgroundJob } from "@/tools/start-background-job";
import { todoWrite } from "@/tools/todo-write";
import { previewWriteToFile, writeToFile } from "@/tools/write-to-file";
import type { Environment } from "@getpochi/common";
import { type UserInfo, getStoreId } from "@getpochi/common/configuration";
import {
  GitStatusReader,
  ignoreWalk,
  isPlainTextFile,
  listWorkspaceFiles,
} from "@getpochi/common/tool-utils";
import { getVendor } from "@getpochi/common/vendor";
import type {
  CustomAgentFile,
  PochiCredentials,
} from "@getpochi/common/vscode-webui-bridge";
import type {
  CaptureEvent,
  DisplayModel,
  McpStatus,
  ResourceURI,
  RuleFile,
  SaveCheckpointOptions,
  SessionState,
  VSCodeHostApi,
  WorkspaceState,
} from "@getpochi/common/vscode-webui-bridge";
import type {
  PreviewToolFunctionType,
  ToolFunctionType,
} from "@getpochi/tools";
import { createClientTools } from "@getpochi/tools";
import {
  ThreadAbortSignal,
  type ThreadAbortSignalSerialization,
} from "@quilted/threads";
import {
  ThreadSignal,
  type ThreadSignalSerialization,
} from "@quilted/threads/signals";
import type { Tool } from "ai";
import { entries, keys } from "remeda";
import * as runExclusive from "run-exclusive";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { CheckpointService } from "../checkpoint/checkpoint-service";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "../configuration";
import { DiffChangesContentProvider } from "../editor/diff-changes-content-provider";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { type FileSelection, TabState } from "../editor/tab-state";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { McpHub } from "../mcp/mcp-hub";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { ThirdMcpImporter } from "../mcp/third-party-mcp";
import { isExecutable } from "../mcp/types";
import { listSymbols } from "../symbol";
import {
  convertUrl,
  isLocalUrl,
  promptPublicUrlConversion,
} from "../terminal-link-provider/url-utils";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { TerminalState } from "../terminal/terminal-state";

const logger = getLogger("VSCodeHostImpl");

@injectable()
@singleton()
export class VSCodeHostImpl implements VSCodeHostApi, vscode.Disposable {
  private toolCallGroup = runExclusive.createGroupRef();
  private checkpointGroup = runExclusive.createGroupRef();
  private sessionState: SessionState = {};
  private disposables: vscode.Disposable[] = [];

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
    private readonly tabState: TabState,
    private readonly terminalState: TerminalState,
    private readonly posthog: PostHog,
    private readonly mcpHub: McpHub,
    private readonly thirdMcpImporter: ThirdMcpImporter,
    private readonly checkpointService: CheckpointService,
    private readonly pochiConfiguration: PochiConfiguration,
    private readonly modelList: ModelList,
    private readonly userStorage: UserStorage,
    private readonly customAgentManager: CustomAgentManager,
  ) {}

  listRuleFiles = async (): Promise<RuleFile[]> => {
    return await collectRuleFiles();
  };

  listWorkflowsInWorkspace = (): Promise<
    { id: string; path: string; content: string }[]
  > => {
    return collectWorkflows();
  };

  readResourceURI = (): Promise<ResourceURI> => {
    throw new Error("Method not implemented.");
  };

  readPochiCredentials = async (): Promise<PochiCredentials | null> => {
    try {
      return (await getVendor("pochi").getCredentials()) as PochiCredentials;
    } catch (err) {
      return null;
    }
  };

  readStoreId = async (): Promise<string | undefined> => {
    const cwd = await this.readCurrentWorkspace();
    if (cwd) {
      return getStoreId(cwd);
    }
    return undefined;
  };

  getSessionState = async <K extends keyof SessionState>(
    keys?: K[] | undefined,
  ): Promise<Pick<SessionState, K>> => {
    if (!keys || keys.length === 0) {
      return { ...this.sessionState };
    }

    return keys.reduce<Pick<SessionState, K>>(
      (filtered, key) => {
        if (Object.prototype.hasOwnProperty.call(this.sessionState, key)) {
          filtered[key] = this.sessionState[key];
        }
        return filtered;
      },
      {} as Pick<SessionState, K>,
    );
  };

  setSessionState = async (state: Partial<SessionState>): Promise<void> => {
    Object.assign(this.sessionState, state);
  };

  getWorkspaceState = async <K extends keyof WorkspaceState>(
    key: K,
    defaultValue?: WorkspaceState[K],
  ): Promise<WorkspaceState[K]> => {
    return this.context.workspaceState.get(key, defaultValue);
  };

  setWorkspaceState = async <K extends keyof WorkspaceState>(
    key: K,
    value: WorkspaceState[K],
  ): Promise<void> => {
    return this.context.workspaceState.update(key, value);
  };

  readEnvironment = async (isSubTask = false): Promise<Environment> => {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    const { files, isTruncated } = workspaceFolders?.length
      ? await listWorkspaceFiles({
          cwd: workspaceFolders[0].uri.fsPath,
          recursive: true,
          maxItems: 500,
        })
      : { files: [], isTruncated: false };

    const customRules = isSubTask ? undefined : await collectCustomRules();

    const systemInfo = getSystemInfo();

    const gitStatusReader = new GitStatusReader({
      cwd: getWorkspaceFolder().uri.fsPath,
    });
    const gitStatus = await gitStatusReader.readGitStatus();

    const environment: Environment = {
      currentTime: new Date().toString(),
      workspace: {
        files,
        isTruncated,
        gitStatus,
        activeTabs: this.tabState.activeTabs.value.map((tab) => ({
          filepath: tab.filepath,
          isActive:
            tab.filepath === this.tabState.activeSelection.value?.filepath,
        })),
        activeSelection: this.tabState.activeSelection.value,
        terminals: this.terminalState.visibleTerminals.value,
      },
      info: {
        ...systemInfo,
        customRules,
      },
    };

    return environment;
  };

  readActiveTabs = async (): Promise<
    ThreadSignalSerialization<Array<{ filepath: string; isDir: boolean }>>
  > => {
    return ThreadSignal.serialize(this.tabState.activeTabs);
  };

  readActiveSelection = async (): Promise<
    ThreadSignalSerialization<FileSelection | undefined>
  > => {
    return ThreadSignal.serialize(this.tabState.activeSelection);
  };

  readVisibleTerminals = async () => {
    return {
      terminals: ThreadSignal.serialize(this.terminalState.visibleTerminals),
      openBackgroundJobTerminal: async (backgroundJobId: string) => {
        this.terminalState.openBackgroundJobTerminal(backgroundJobId);
      },
    };
  };

  readCurrentWorkspace = async (): Promise<string | undefined> => {
    return vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  };

  readMinionId = async (): Promise<string | null> => {
    return process.env.POCHI_MINION_ID || null;
  };

  listFilesInWorkspace = async (): Promise<
    {
      filepath: string;
      isDir: boolean;
    }[]
  > => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length || !workspaceFolders[0]) {
      return [];
    }

    const results = await ignoreWalk({
      dir: workspaceFolders[0].uri.fsPath,
      recursive: true,
    });
    return results.map((item) => ({
      filepath: vscode.workspace.asRelativePath(item.filepath),
      isDir: item.isDir,
    }));
  };

  listAutoCompleteCandidates = async (): Promise<string[]> => {
    const clientTools = keys(createClientTools());
    const mcps = entries(this.mcpHub.status.value.connections)
      .filter(([_, v]) => v.status === "ready")
      .map(([id]) => id);

    // Inline listDocumentCompletion function
    const candidates: string[] = [];
    for (const x of vscode.window.visibleTextEditors) {
      // Inline getUniqueTokens function
      // 1. Define the regular expression to find all "words".
      //    - [\w_]+ : Matches one or more word characters (a-z, A-Z, 0-9) or underscores.
      //    - g       : The global flag, to find all matches in the string, not just the first.
      const wordRegex = /[\w_]+/g;

      // 2. Extract all matching tokens.
      //    - String.prototype.match() returns an array of all matches or `null` if no matches are found.
      //    - We use `|| []` to gracefully handle the `null` case by providing an empty array.
      const tokens = x.document.getText().match(wordRegex) || [];
      candidates.push(...tokens);
    }

    return [...new Set([...clientTools, ...mcps, ...candidates])].filter(
      (candidate) => candidate.length <= 64,
    );
  };

  openSymbol = async (symbol: string) => {
    const symbolInfos = await listSymbols({ query: symbol, limit: 1 });
    if (symbolInfos.length > 0) {
      const symbolInfo = symbolInfos[0];
      const fileUri = vscode.Uri.joinPath(
        getWorkspaceFolder().uri,
        symbolInfo.filepath,
      );
      await vscode.window.showTextDocument(fileUri, {
        selection: new vscode.Range(
          symbolInfo?.range?.start?.line ?? 0,
          symbolInfo?.range?.start?.character ?? 0,
          symbolInfo?.range?.end?.line ?? 0,
          symbolInfo?.range?.end?.character ?? 0,
        ),
      });
    }
  };

  executeToolCall = runExclusive.build(
    this.toolCallGroup,
    async (
      toolName: string,
      args: unknown,
      options: {
        toolCallId: string;
        abortSignal: ThreadAbortSignalSerialization;
        nonInteractive?: boolean;
      },
    ) => {
      let tool: ToolFunctionType<Tool> | undefined;

      if (toolName in ToolMap) {
        tool = ToolMap[toolName];
      } else if (toolName in this.mcpHub.status.value.toolset) {
        const mcpTool = this.mcpHub.status.value.toolset[toolName];
        if (isExecutable(mcpTool)) {
          tool = (args, options) => {
            return mcpTool.execute(args, options);
          };
        }
      }

      if (!tool) {
        return {
          error: `Tool ${toolName} not found.`,
        };
      }

      const abortSignal = new ThreadAbortSignal(options.abortSignal);
      const toolCallStart = Date.now();
      const result = await safeCall(
        tool(args, {
          abortSignal,
          messages: [],
          toolCallId: options.toolCallId,
          nonInteractive: options.nonInteractive,
        }),
      );

      const status = abortSignal.aborted
        ? "aborted"
        : typeof result === "object" && result && "error" in result
          ? "error"
          : "success";

      const durationMs = Date.now() - toolCallStart;
      logger.debug(
        `executeToolCall: ${toolName}(${options.toolCallId}) took ${durationMs}ms => ${status}`,
      );

      this.capture({
        event: "executeToolCall",
        properties: {
          toolName,
          durationMs,
          batched: options.toolCallId.startsWith("batch-"),
          status,
        },
      });

      return result;
    },
  );

  previewToolCall = runExclusive.build(
    this.toolCallGroup,
    async (
      toolName: string,
      args: unknown,
      options: {
        toolCallId: string;
        state: "partial-call" | "call" | "result";
        abortSignal?: ThreadAbortSignalSerialization;
      },
    ) => {
      const tool = ToolPreviewMap[toolName];
      if (!tool) {
        return;
      }

      if (options.state === "call") {
        logger.debug(
          `previewToolCall(call): ${toolName}(${options.toolCallId})`,
        );
      }

      const abortSignal = options.abortSignal
        ? new ThreadAbortSignal(options.abortSignal)
        : undefined;

      return await safeCall<undefined>(
        // biome-ignore lint/suspicious/noExplicitAny: external call without type information
        tool(args as any, {
          ...options,
          abortSignal,
        }),
      );
    },
  );

  openFile = async (
    filePath: string,
    options?: {
      start?: number;
      end?: number;
      preserveFocus?: boolean;
      base64Data?: string;
      fallbackGlobPattern?: string;
    },
  ) => {
    const current = getWorkspaceFolder().uri;

    const fileUri = path.isAbsolute(filePath)
      ? vscode.Uri.file(filePath)
      : vscode.Uri.joinPath(current, filePath);

    try {
      const stat = await vscode.workspace.fs.stat(fileUri);
      if (stat.type === vscode.FileType.Directory) {
        // reveal and expand it
        await vscode.commands.executeCommand("revealInExplorer", fileUri);
        await vscode.commands.executeCommand("list.expand");
      } else if (stat.type === vscode.FileType.File) {
        const isPlainText = await isPlainTextFile(fileUri.fsPath);
        if (!isPlainText) {
          await vscode.commands.executeCommand("vscode.open", fileUri);
        } else {
          const start = options?.start ?? 1;
          const end = options?.end ?? start;
          vscode.window.showTextDocument(fileUri, {
            selection: new vscode.Range(start - 1, 0, end - 1, 0),
            preserveFocus: options?.preserveFocus,
          });
        }
      }
    } catch (error) {
      logger.info("File not found, trying to open from base64 data", error);
      // file may not exist, check if has base64Data
      if (options?.base64Data) {
        try {
          // If base64 data is present, open it as a temp file
          const tempFile = vscode.Uri.file(
            path.join(os.tmpdir(), fileUri.path),
          );
          await vscode.workspace.fs.writeFile(
            tempFile,
            Buffer.from(options?.base64Data ?? "", "base64"),
          );
          await vscode.commands.executeCommand("vscode.open", tempFile);
        } catch (error) {
          logger.error(`Failed to open file from base64 data: ${error}`);
        }
      }

      if (options?.fallbackGlobPattern) {
        const result = await vscode.workspace.findFiles(
          options.fallbackGlobPattern,
          null,
          1,
        );

        logger.info("found file by glob pattern", result[0]);

        if (result.length > 0) {
          await vscode.commands.executeCommand("vscode.open", result[0]);
        }
      }
    }
  };

  capture = async ({ event, properties }: CaptureEvent) => {
    this.posthog.capture(event, properties);
  };

  closeCurrentWorkspace = async () => {
    await vscode.commands.executeCommand("workbench.action.closeWindow");
  };

  readMcpStatus = async (): Promise<ThreadSignalSerialization<McpStatus>> => {
    return ThreadSignal.serialize(this.mcpHub.status);
  };

  fetchThirdPartyRules = async () => {
    const rulePaths = await detectThirdPartyRules();
    const workspaceRuleExists = await isFileExists(getWorkspaceRulesFileUri());
    const copyRules = async () => {
      await copyThirdPartyRules();
      await vscode.commands.executeCommand("pochi.editWorkspaceRules");
    };
    return { rulePaths, workspaceRuleExists, copyRules };
  };

  fetchAvailableThirdPartyMcpConfigs = async () => {
    const availableProviders =
      await this.thirdMcpImporter.getAvailableProviders();
    const availableConfigs = availableProviders.map((provider) => ({
      name: provider.name,
      description: provider.description,
      path: provider.getDisplayPath?.() ?? "",
    }));

    const importFromAllConfigs = async () => {
      await this.thirdMcpImporter.importFromAllProviders();
    };

    const importFromConfig = async (config: {
      name: string;
      path: string;
      description: string;
    }) => {
      const provider = availableProviders.find((p) => p.name === config.name);
      if (provider) {
        await this.thirdMcpImporter.importFromProvider(provider);
      } else {
        logger.error(`Provider with name ${config.name} not found for import.`);
      }
    };

    const openConfig = async (config: { name: string }) => {
      const provider = availableProviders.find((p) => p.name === config.name);
      if (provider) {
        await provider.openConfig();
      } else {
        logger.error(
          `Provider with name ${config.name} not found for opening.`,
        );
      }
    };

    return {
      availableConfigs,
      importFromAllConfigs,
      importFromConfig,
      openConfig,
    };
  };

  openExternal = async (uri: string): Promise<void> => {
    const sandboxHost = process.env.POCHI_SANDBOX_HOST;

    let parsedUri = vscode.Uri.parse(uri);
    if (sandboxHost && isLocalUrl(parsedUri)) {
      parsedUri = convertUrl(parsedUri, sandboxHost);
      const result = await promptPublicUrlConversion(
        parsedUri,
        this.context.globalState,
      );
      if (!result) {
        return;
      }
    }
    await vscode.env.openExternal(parsedUri);
  };

  saveCheckpoint = runExclusive.build(
    this.checkpointGroup,
    async (
      message: string,
      options?: SaveCheckpointOptions,
    ): Promise<string | null> => {
      return await this.checkpointService.saveCheckpoint(message, options);
    },
  );

  restoreCheckpoint = runExclusive.build(
    this.checkpointGroup,
    async (commitHash: string): Promise<void> => {
      await this.checkpointService.restoreCheckpoint(commitHash);
    },
  );

  readCheckpointPath = async (): Promise<string | undefined> => {
    return this.checkpointService.getShadowGitPath();
  };

  diffWithCheckpoint = runExclusive.build(
    this.checkpointGroup,
    async (fromCheckpoint: string) => {
      try {
        // Get changes using existing method
        const changes =
          await this.checkpointService.getCheckpointUserEditsDiff(
            fromCheckpoint,
          );
        if (!changes || changes.length === 0) {
          return null;
        }
        return changes;
      } catch (error) {
        logger.error(
          `Failed to get user edits since last checkpoint: ${error}`,
        );
        return null;
      }
    },
  );

  showCheckpointDiff = runExclusive.build(
    this.checkpointGroup,
    async (
      title: string,
      checkpoint: { origin: string; modified?: string },
      displayPath?: string,
    ) => {
      const changedFiles = await this.checkpointService.getCheckpointChanges(
        checkpoint.origin,
        checkpoint.modified,
      );
      if (changedFiles.length === 0) {
        logger.info(
          `No changes found in the checkpoint from ${checkpoint.origin} to ${checkpoint.modified}`,
        );
        return false;
      }
      if (displayPath) {
        const changedFile = changedFiles.filter(
          (file) => file.filepath === displayPath,
        )[0];
        await vscode.commands.executeCommand(
          "vscode.diff",
          vscode.Uri.parse(
            `${DiffChangesContentProvider.scheme}:${changedFile.filepath}`,
          ).with({
            query: Buffer.from(changedFile.before ?? "").toString("base64"),
          }),
          vscode.Uri.parse(
            `${DiffChangesContentProvider.scheme}:${changedFile.filepath}`,
          ).with({
            query: Buffer.from(changedFile.after ?? "").toString("base64"),
          }),
          title,
          {
            preview: true,
            preserveFocus: true,
          },
        );
        return true;
      }
      await vscode.commands.executeCommand(
        "vscode.changes",
        title,
        changedFiles.map((file) => [
          vscode.Uri.joinPath(getWorkspaceFolder().uri, file.filepath),
          vscode.Uri.parse(
            `${DiffChangesContentProvider.scheme}:${file.filepath}`,
          ).with({
            query: Buffer.from(file.before ?? "").toString("base64"),
          }),
          vscode.Uri.joinPath(getWorkspaceFolder().uri, file.filepath),
        ]),
      );
      return true;
    },
  );

  readExtensionVersion = async () => {
    return this.context.extension.packageJSON.version;
  };

  readAutoSaveDisabled = async (): Promise<
    ThreadSignalSerialization<boolean>
  > => {
    return ThreadSignal.serialize(this.pochiConfiguration.autoSaveDisabled);
  };

  showInformationMessage = async <T extends string>(
    message: string,
    options: { modal?: boolean; detail?: string },
    ...items: T[]
  ): Promise<T | undefined> => {
    return await vscode.window.showInformationMessage(
      message,
      options,
      ...items,
    );
  };

  readModelList = async (): Promise<
    ThreadSignalSerialization<DisplayModel[]>
  > => {
    return ThreadSignal.serialize(this.modelList.modelList);
  };

  readUserStorage = async (): Promise<
    ThreadSignalSerialization<Record<string, UserInfo>>
  > => {
    return ThreadSignal.serialize(this.userStorage.users);
  };

  readCustomAgents = async (): Promise<
    ThreadSignalSerialization<CustomAgentFile[]>
  > => {
    return ThreadSignal.serialize(this.customAgentManager.agents);
  };

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

function safeCall<T>(x: Promise<T>) {
  return x.catch((e) => {
    return {
      error: e.message as string,
    };
  });
}

const ToolMap: Record<
  string,
  // biome-ignore lint/suspicious/noExplicitAny: external call without type information
  ToolFunctionType<any>
> = {
  readFile,
  executeCommand,
  startBackgroundJob,
  readBackgroundJobOutput,
  killBackgroundJob,
  searchFiles,
  listFiles: listFilesTool,
  globFiles,
  writeToFile,
  applyDiff,
  todoWrite,
  multiApplyDiff,
};

const ToolPreviewMap: Record<
  string,
  // biome-ignore lint/suspicious/noExplicitAny: external call without type information
  PreviewToolFunctionType<any>
> = {
  writeToFile: previewWriteToFile,
  applyDiff: previewApplyDiff,
  multiApplyDiff: previewMultiApplyDiff,
};
