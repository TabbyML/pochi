import * as os from "node:os";
import path from "node:path";
import { executeCommandWithNode } from "@/integrations/terminal/execute-command-with-node";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { CustomAgentManager } from "@/lib/custom-agent";
import {
  collectCustomRules,
  collectRuleFiles,
  collectWorkflows,
  copyThirdPartyRules,
  detectThirdPartyRules,
  getSystemInfo,
  getWorkspaceRulesFileUri,
} from "@/lib/env";
import { asRelativePath, isFileExists } from "@/lib/fs";
import { getLogger } from "@/lib/logger";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { ModelList } from "@/lib/model-list";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PostHog } from "@/lib/posthog";
import { taskRunning, taskUpdated } from "@/lib/task-events";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { UserStorage } from "@/lib/user-storage";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceScope } from "@/lib/workspace-scoped";
import { applyDiff, previewApplyDiff } from "@/tools/apply-diff";
import { editNotebook } from "@/tools/edit-notebook";
import { executeCommand } from "@/tools/execute-command";
import { globFiles } from "@/tools/glob-files";
import { killBackgroundJob } from "@/tools/kill-background-job";
import { listFiles as listFilesTool } from "@/tools/list-files";
import { readBackgroundJobOutput } from "@/tools/read-background-job-output";
import { readFile } from "@/tools/read-file";
import { searchFiles } from "@/tools/search-files";
import { startBackgroundJob } from "@/tools/start-background-job";
import { todoWrite } from "@/tools/todo-write";
import { previewWriteToFile, writeToFile } from "@/tools/write-to-file";
import type { Environment, GitStatus } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import { getWorktreeNameFromWorktreePath } from "@getpochi/common/git-utils";
import type { McpStatus } from "@getpochi/common/mcp-utils";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { McpHub } from "@getpochi/common/mcp-utils";
import {
  GitStatusReader,
  ignoreWalk,
  isPlainTextFile,
  listWorkspaceFiles,
} from "@getpochi/common/tool-utils";
import { getVendor } from "@getpochi/common/vendor";
import {
  type CaptureEvent,
  type CreateWorktreeOptions,
  type CustomAgentFile,
  type DiffCheckpointOptions,
  type DisplayModel,
  type GitWorktree,
  type GithubIssue,
  type NewTaskPanelParams,
  type PochiCredentials,
  type ResourceURI,
  type RuleFile,
  type SaveCheckpointOptions,
  type SessionState,
  type TaskChangedFile,
  type TaskPanelParams,
  type TaskStates,
  type VSCodeHostApi,
  type WorkspaceState,
  getTaskDisplayTitle,
} from "@getpochi/common/vscode-webui-bridge";
import type {
  PreviewReturnType,
  PreviewToolFunctionType,
  ToolFunctionType,
} from "@getpochi/tools";
import { createClientTools } from "@getpochi/tools";
import { computed } from "@preact/signals-core";
import {
  ThreadAbortSignal,
  type ThreadAbortSignalSerialization,
} from "@quilted/threads";
import {
  ThreadSignal,
  type ThreadSignalSerialization,
} from "@quilted/threads/signals";
import type { Tool } from "ai";
import { keys } from "remeda";
import * as runExclusive from "run-exclusive";
import { Lifecycle, inject, injectable, scoped } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { CheckpointService } from "../checkpoint/checkpoint-service";
import type { GitDiff } from "../checkpoint/types";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "../configuration";
import { DiffChangesContentProvider } from "../editor/diff-changes-content-provider";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiTaskState } from "../editor/pochi-task-state";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { type FileSelection, TabState } from "../editor/tab-state";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorktreeManager } from "../git/worktree";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { GithubIssueState } from "../github/github-issue-state";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { GithubPullRequestState } from "../github/github-pull-request-state";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { ThirdMcpImporter } from "../mcp/third-party-mcp";
import {
  convertUrl,
  isLocalUrl,
  promptPublicUrlConversion,
} from "../terminal-link-provider/url-utils";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { TerminalState } from "../terminal/terminal-state";
import { PochiTaskEditorProvider } from "./webview-panel";

const logger = getLogger("VSCodeHostImpl");

@scoped(Lifecycle.ContainerScoped)
@injectable()
export class VSCodeHostImpl implements VSCodeHostApi, vscode.Disposable {
  private toolCallGroup = runExclusive.createGroupRef();
  private checkpointGroup = runExclusive.createGroupRef();
  private disposables: vscode.Disposable[] = [];

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
    private readonly tabState: TabState,
    private readonly terminalState: TerminalState,
    private readonly posthog: PostHog,
    private readonly mcpHub: McpHub,
    private readonly thirdMcpImporter: ThirdMcpImporter,
    private readonly pochiConfiguration: PochiConfiguration,
    private readonly modelList: ModelList,
    private readonly userStorage: UserStorage,
    private readonly workspaceScope: WorkspaceScope,
    private readonly checkpointService: CheckpointService,
    private readonly customAgentManager: CustomAgentManager,
    private readonly worktreeManager: WorktreeManager,
    private readonly pochiTaskState: PochiTaskState,
    private readonly githubPullRequestState: GithubPullRequestState,
    private readonly githubIssueState: GithubIssueState,
  ) {}

  private get cwd() {
    return this.workspaceScope.cwd;
  }

  listRuleFiles = async (): Promise<RuleFile[]> => {
    return this.cwd ? await collectRuleFiles(this.cwd) : [];
  };

  listWorkflows = (): Promise<
    {
      id: string;
      path: string;
      content: string;
      frontmatter: { model?: string };
    }[]
  > => {
    return this.cwd ? collectWorkflows(this.cwd) : Promise.resolve([]);
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

  // These methods are overridden in the wrapper created by BaseWebview.createVSCodeHostWrapper()
  // They are only here to satisfy the VSCodeHostApi interface
  getSessionState = async <K extends keyof SessionState>(
    _keys?: K[] | undefined,
  ): Promise<Pick<SessionState, K>> => {
    throw new Error(
      "getSessionState should be called on the webview-specific wrapper, not the singleton",
    );
  };

  setSessionState = async (_state: Partial<SessionState>): Promise<void> => {
    throw new Error(
      "setSessionState should be called on the webview-specific wrapper, not the singleton",
    );
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

  getGlobalState = async (
    key: string,
    defaultValue?: unknown,
  ): Promise<unknown> => {
    return this.context.globalState.get(key, defaultValue);
  };

  setGlobalState = async (key: string, value: unknown): Promise<void> => {
    await this.context.globalState.update(key, value);
  };

  readEnvironment = async (options: {
    isSubTask?: boolean;
    webviewKind: "sidebar" | "pane";
  }): Promise<Environment> => {
    const isSubTask = options.isSubTask ?? false;
    const webviewKind = options.webviewKind;
    const { files, isTruncated } = this.cwd
      ? await listWorkspaceFiles({
          cwd: this.cwd,
          recursive: true,
          maxItems: 500,
        })
      : { files: [], isTruncated: false };

    const customRules =
      !isSubTask && this.cwd ? await collectCustomRules(this.cwd) : undefined;

    const systemInfo = getSystemInfo(this.cwd);

    let gitStatus: GitStatus | undefined;
    if (this.cwd) {
      const gitStatusReader = new GitStatusReader({
        cwd: this.cwd,
        webviewKind,
      });
      gitStatus = await gitStatusReader.readGitStatus();
    }

    const environment: Environment = {
      currentTime: new Date().toString(),
      workspace: {
        files,
        isTruncated,
        gitStatus,
        activeTabs: this.tabState.activeTabs.value.map((tab) => ({
          filepath: asRelativePath(tab.filepath, this.cwd ?? ""),
          isActive:
            tab.filepath === this.tabState.activeSelection.value?.filepath,
        })),
        activeSelection: this.tabState.activeSelection.value
          ? {
              ...this.tabState.activeSelection.value,
              filepath: asRelativePath(
                this.tabState.activeSelection.value.filepath,
                this.cwd ?? "",
              ),
            }
          : undefined,
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
    return ThreadSignal.serialize(
      computed(() =>
        this.tabState.activeTabs.value.map((tab) => ({
          filepath: asRelativePath(tab.filepath, this.cwd ?? ""),
          isDir: tab.isDir,
        })),
      ),
    );
  };

  readPochiTabs = async (): Promise<ThreadSignalSerialization<TaskStates>> => {
    return ThreadSignal.serialize(this.pochiTaskState.state);
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

  readCurrentWorkspace = async (): Promise<{
    cwd: string | null;
    workspaceFolder: string | null;
  }> => {
    return {
      cwd: this.cwd,
      workspaceFolder:
        vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? null,
    };
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
    if (!this.cwd) {
      return [];
    }

    const results = await ignoreWalk({
      dir: this.cwd,
      recursive: true,
    });
    return results.map((item) => ({
      filepath: asRelativePath(item.filepath, this.cwd ?? ""),
      isDir: item.isDir,
    }));
  };

  listAutoCompleteCandidates = async (): Promise<string[]> => {
    const clientTools = keys(createClientTools());
    const mcps = keys(this.mcpHub.status.value.toolset);

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

  executeToolCall = runExclusive.build(
    this.toolCallGroup,
    async (
      toolName: string,
      args: unknown,
      options: {
        toolCallId: string;
        abortSignal: ThreadAbortSignalSerialization;
        contentType?: string[];
      },
    ) => {
      let tool: ToolFunctionType<Tool> | undefined;

      if (toolName in ToolMap) {
        tool = ToolMap[toolName];
      } else if (toolName in this.mcpHub.executeFns.value) {
        const execute = this.mcpHub.executeFns.value[toolName];
        tool = (args, options) => execute(args, options);
      }

      if (!tool) {
        return {
          error: `Tool ${toolName} not found.`,
        };
      }

      if (!this.cwd) {
        return {
          error: "No workspace folder found.",
        };
      }

      const abortSignal = new ThreadAbortSignal(options.abortSignal);
      const toolCallStart = Date.now();
      const result = await safeCall(
        tool(args, {
          abortSignal,
          messages: [],
          toolCallId: options.toolCallId,
          cwd: this.cwd,
          contentType: options.contentType,
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

      if (!this.cwd) {
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

      return await safeCall<PreviewReturnType>(
        // biome-ignore lint/suspicious/noExplicitAny: external call without type information
        tool(args as any, {
          ...options,
          abortSignal,
          cwd: this.cwd,
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
      cellId?: string;
      webviewKind?: "sidebar" | "pane";
    },
  ) => {
    // Expand ~ to home directory if present
    let resolvedPath = filePath;
    if (filePath.startsWith("~/")) {
      const homedir = os.homedir();
      resolvedPath = filePath.replace(/^~/, homedir);
    }

    const fileUri = path.isAbsolute(resolvedPath)
      ? vscode.Uri.file(resolvedPath)
      : this.cwd
        ? vscode.Uri.joinPath(vscode.Uri.parse(this.cwd), resolvedPath)
        : vscode.Uri.file(resolvedPath);

    try {
      const stat = await vscode.workspace.fs.stat(fileUri);
      if (stat.type === vscode.FileType.Directory) {
        // reveal and expand it
        await vscode.commands.executeCommand("revealInExplorer", fileUri);
        await vscode.commands.executeCommand("list.expand");
      } else if (stat.type === vscode.FileType.File) {
        if (fileUri.fsPath.endsWith(".ipynb")) {
          // Open notebook with the notebook editor
          await vscode.commands.executeCommand(
            "vscode.openWith",
            fileUri,
            "jupyter-notebook",
          );

          if (options?.cellId) {
            const notebook = vscode.workspace.notebookDocuments.find(
              (nb) => nb.uri.toString() === fileUri.toString(),
            );
            if (!notebook) return;
            const cellIndex = notebook
              .getCells()
              .findIndex((cell) => cell.metadata?.id === options.cellId);
            if (cellIndex < 0) return;
            const editor = vscode.window.visibleNotebookEditors.find(
              (e) => e.notebook.uri.toString() === fileUri.toString(),
            );
            if (!editor) return;
            editor.selection = new vscode.NotebookRange(
              cellIndex,
              cellIndex + 1,
            );
            await vscode.commands.executeCommand("notebook.cell.edit");
          }
          return;
        }

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

  readMcpStatus = async (): Promise<ThreadSignalSerialization<McpStatus>> => {
    return ThreadSignal.serialize(this.mcpHub.status);
  };

  fetchThirdPartyRules = async () => {
    const rulePaths = this.cwd ? await detectThirdPartyRules(this.cwd) : [];
    const workspaceRuleExists = this.cwd
      ? await isFileExists(getWorkspaceRulesFileUri(this.cwd))
      : false;
    const copyRules = async () => {
      if (this.cwd) {
        await copyThirdPartyRules(this.cwd);
        await vscode.commands.executeCommand(
          "pochi.editWorkspaceRules",
          this.cwd,
        );
      }
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
    async (commitHash: string, files?: string[]): Promise<void> => {
      await this.checkpointService.restoreCheckpoint(commitHash, files);
    },
  );

  restoreChangedFiles = runExclusive.build(
    this.checkpointGroup,
    async (files: TaskChangedFile[]): Promise<void> => {
      await this.checkpointService.restoreChangedFiles(files);
    },
  );

  readCheckpointPath = async (): Promise<string | undefined> => {
    return this.checkpointService.getShadowGitPath();
  };

  diffWithCheckpoint = runExclusive.build(
    this.checkpointGroup,
    async (
      fromCheckpoint: string,
      files?: string[],
      options?: DiffCheckpointOptions,
    ) => {
      try {
        // Get changes using existing method
        const changes = await this.checkpointService.getCheckpointFileEdits(
          fromCheckpoint,
          files,
          options,
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
      displayPaths?: string[],
    ) => {
      logger.debug(
        `Showing checkpoint diff: from ${checkpoint.origin} to ${
          checkpoint.modified ?? "HEAD"
        }`,
      );
      const changedFiles = await this.checkpointService.getCheckpointChanges(
        checkpoint.origin,
        checkpoint.modified,
      );
      if (!changedFiles || changedFiles.length === 0) {
        logger.info(
          `No changes found in the checkpoint from ${checkpoint.origin} to ${checkpoint.modified}`,
        );
        return false;
      }

      if (!this.cwd) {
        return false;
      }

      const displayFiles = displayPaths
        ? changedFiles.filter(
            (file) => file.filepath && displayPaths.includes(file.filepath),
          )
        : changedFiles;

      return await showDiff(displayFiles, title, this.cwd);
    },
  );

  diffChangedFiles = runExclusive.build(
    this.checkpointGroup,
    async (files: TaskChangedFile[]) => {
      return this.checkpointService.diffChangedFiles(files);
    },
  );

  showChangedFiles = runExclusive.build(
    this.checkpointGroup,
    async (files: TaskChangedFile[], title: string) => {
      const changes =
        await this.checkpointService.getChangedFilesChanges(files);
      if (!this.cwd) {
        return false;
      }
      return await showDiff(changes, title, this.cwd);
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

  openTaskInPanel = async (
    params: TaskPanelParams | NewTaskPanelParams,
  ): Promise<void> => {
    await PochiTaskEditorProvider.openTaskEditor(params);
  };

  sendTaskNotification = async (
    kind: "failed" | "completed" | "pending-tool" | "pending-input",
    params: { uid: string; displayId?: number; isSubTask?: boolean },
  ) => {
    if (!this.cwd) return;

    const taskStates = this.pochiTaskState.state.value;
    const targetTaskState = taskStates[params.uid];
    if (targetTaskState?.active) {
      return;
    }

    let renderMessage = "";
    switch (kind) {
      case "pending-tool":
        renderMessage =
          "Pochi is trying to make a tool call that requires your approval.";
        break;
      case "pending-input":
        renderMessage = "Pochi is waiting for your input to continue.";
        break;
      case "completed":
        renderMessage = params.isSubTask
          ? "Pochi has completed the sub task."
          : "Pochi has completed the task.";
        break;
      case "failed":
        renderMessage = "Pochi is running into error, please take a look.";
        break;
      default:
        break;
    }
    const { displayId, uid } = params;
    const worktreeName = getWorktreeNameFromWorktreePath(this.cwd);
    const taskTitle = getTaskDisplayTitle({
      worktreeName:
        this.workspaceScope.isMain || !worktreeName
          ? "workspace"
          : worktreeName,
      displayId,
      uid,
    });
    const buttonText = "View Details";
    const result = await this.showInformationMessage(
      `[${taskTitle}] ${renderMessage}`,
      {
        modal: false,
      },
      buttonText,
    );
    if (result === buttonText) {
      this.openTaskInPanel({
        uid,
        cwd: this.cwd,
        displayId,
      });
    }
  };

  executeBashCommand = async (
    command: string,
    abortSignal: ThreadAbortSignalSerialization,
  ): Promise<{ output: string; error?: string }> => {
    const signal = new ThreadAbortSignal(abortSignal);
    if (!this.cwd) {
      return { output: "", error: "No workspace folder found." };
    }

    let capturedOutput = "";
    try {
      const { output } = await executeCommandWithNode({
        command,
        cwd: this.cwd,
        abortSignal: signal as AbortSignal,
        timeout: 10,
        onData: (data) => {
          capturedOutput = data.output;
        },
      });
      return { output };
    } catch (err: unknown) {
      // err is likely an ExecutionError
      // We return the output captured so far, and the error message.
      const message = err instanceof Error ? err.message : String(err);
      return { output: capturedOutput, error: message };
    }
  };

  readCustomAgents = async (): Promise<
    ThreadSignalSerialization<CustomAgentFile[]>
  > => {
    return ThreadSignal.serialize(this.customAgentManager.agents);
  };

  onTaskUpdated = async (taskData: unknown): Promise<void> => {
    taskUpdated.fire({ event: taskData });
  };

  onTaskRunning = async (taskId: string): Promise<void> => {
    taskRunning.fire({ taskId });
  };

  readWorktrees = async (): Promise<{
    worktrees: ThreadSignalSerialization<GitWorktree[]>;
    gh: ThreadSignalSerialization<{
      installed: boolean;
      authorized: boolean;
    }>;
    gitOriginUrl: string | null;
  }> => {
    return {
      worktrees: ThreadSignal.serialize(this.worktreeManager.worktrees),
      gh: ThreadSignal.serialize(this.githubPullRequestState.gh),
      gitOriginUrl: await this.worktreeManager.getOriginUrl(),
    };
  };

  createWorktree = async (options: CreateWorktreeOptions) => {
    return await this.worktreeManager.createWorktree(options);
  };

  deleteWorktree = async (worktreePath: string): Promise<boolean> => {
    return await this.worktreeManager.deleteWorktree(worktreePath);
  };

  queryGithubIssues = async (query?: string): Promise<GithubIssue[]> => {
    if (this.githubPullRequestState.gh.value.authorized === false) {
      return [];
    }
    return await this.githubIssueState.queryIssues(query);
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
  editNotebook,
};

const ToolPreviewMap: Record<
  string,
  // biome-ignore lint/suspicious/noExplicitAny: external call without type information
  PreviewToolFunctionType<any>
> = {
  writeToFile: previewWriteToFile,
  applyDiff: previewApplyDiff,
};

async function showDiff(displayFiles: GitDiff[], title: string, cwd: string) {
  if (displayFiles.length === 0) {
    return false;
  }

  if (displayFiles.length === 1) {
    const changedFile = displayFiles[0];

    await vscode.commands.executeCommand(
      "vscode.diff",
      DiffChangesContentProvider.decode({
        filepath: changedFile.filepath,
        content: changedFile.before ?? "",
        cwd: cwd,
      }),
      DiffChangesContentProvider.decode({
        filepath: changedFile.filepath,
        content: changedFile.after ?? "",
        cwd: cwd,
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
    displayFiles.map((file) => [
      vscode.Uri.joinPath(vscode.Uri.parse(cwd ?? ""), file.filepath),
      DiffChangesContentProvider.decode({
        filepath: file.filepath,
        content: file.before ?? "",
        cwd: cwd ?? "",
      }),
      vscode.Uri.joinPath(vscode.Uri.parse(cwd ?? ""), file.filepath),
    ]),
  );
  return true;
}
