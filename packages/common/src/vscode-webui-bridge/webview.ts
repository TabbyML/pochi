import type { ThreadAbortSignalSerialization } from "@quilted/threads";
import type { ThreadSignalSerialization } from "@quilted/threads/signals";
import type { Environment } from "../base";
import type { UserInfo } from "../configuration";
import type {
  CaptureEvent,
  CustomAgentFile,
  McpStatus,
  NewTaskParams,
  ResourceURI,
  RuleFile,
  SaveCheckpointOptions,
  SessionState,
  TaskIdParams,
  UserEditsDiff,
  WorkspaceState,
} from "./index";
import type { DisplayModel } from "./types/model";
import type { PochiCredentials } from "./types/pochi";

export interface VSCodeHostApi {
  readResourceURI(): Promise<ResourceURI>;

  readPochiCredentials(): Promise<PochiCredentials | null>;

  readMachineId(): Promise<string>;

  getSessionState<K extends keyof SessionState>(
    keys?: K[],
  ): Promise<Pick<SessionState, K>>;
  setSessionState(state: Partial<SessionState>): Promise<void>;

  getWorkspaceState<K extends keyof WorkspaceState>(
    key: K,
    defaultValue?: WorkspaceState[K],
  ): Promise<WorkspaceState[K]>;

  setWorkspaceState<K extends keyof WorkspaceState>(
    key: K,
    value: WorkspaceState[K],
  ): Promise<void>;

  readEnvironment(isSubTask?: boolean): Promise<Environment>;

  previewToolCall(
    toolName: string,
    args: unknown,
    options: {
      toolCallId: string;
      state: "partial-call" | "call" | "result";
      abortSignal?: ThreadAbortSignalSerialization;
    },
  ): Promise<
    | {
        error: string;
      }
    | undefined
  >;

  /**
   * Execute a tool call.
   * @param toolName The name of the tool to execute.
   * @param args The arguments to pass to the tool.
   * @param options Options for the tool call.
   * @return A promise that resolves to the result of the tool call.
   *         The result can be any type, depending on the tool's implementation.
   *         for "executeCommand" tool, the result is {@link ExecuteCommandResult}.
   */
  executeToolCall(
    toolName: string,
    args: unknown,
    options: {
      toolCallId: string;
      abortSignal: ThreadAbortSignalSerialization;
      nonInteractive?: boolean;
    },
  ): Promise<unknown>;

  listFilesInWorkspace(): Promise<
    {
      filepath: string;
      isDir: boolean;
    }[]
  >;

  listAutoCompleteCandidates(): Promise<string[]>;

  /**
   * List all rule files in the workspace and home directory.
   */
  listRuleFiles(): Promise<RuleFile[]>;

  /**
   * List all workflows from .pochirules/workflows directory
   * Returns an array of objects containing the name and content of each workflow.
   */
  listWorkflowsInWorkspace(): Promise<
    {
      id: string;
      path: string;
      content: string;
      frontmatter: { model?: string };
    }[]
  >;

  /**
   * Get active tabs with real-time updates via ThreadSignal
   * Each tab is represented by an object with:
   * - filepath: Path to the file
   *   - For files within workspace: Returns path relative to workspace root (e.g., "src/index.ts")
   *   - For files outside workspace: Returns the absolute file path unchanged (e.g., "/Users/name/project/file.ts")
   * - isDir: Boolean indicating if the item is a directory
   *
   */
  readActiveTabs(): Promise<
    ThreadSignalSerialization<Array<{ filepath: string; isDir: boolean }>>
  >;

  readActiveSelection(): Promise<
    ThreadSignalSerialization<
      Environment["workspace"]["activeSelection"] | undefined
    >
  >;

  readVisibleTerminals(): Promise<{
    terminals: ThreadSignalSerialization<
      Environment["workspace"]["terminals"] | undefined
    >;
    openBackgroundJobTerminal: (backgroundJobId: string) => Promise<void>;
  }>;

  /**
   * Opens a file at the specified file path.
   *
   * @param filePath - The path to the file to be opened.
   * @param options - Optional parameters for opening the file.
   * @param options.start - The starting line number (1-based) to open the file at.
   * @param options.end - The ending line number (1-based) to open the file at.
   * @param options.preserveFocus - If true, the file will be opened without changing focus. Only applicable for text files.
   * @param options.fallbackGlobPattern - A glob pattern to find file to open if filePath not exist.
   */
  openFile(
    filePath: string,
    options?: {
      start?: number;
      end?: number;
      preserveFocus?: boolean;
      base64Data?: string;
      fallbackGlobPattern?: string;
    },
  ): void;

  readCurrentWorkspace(): Promise<string | undefined>;

  readCustomAgents(): Promise<ThreadSignalSerialization<CustomAgentFile[]>>;

  readMinionId(): Promise<string | null>;

  /**
   * @param event - The event name.
   * @param properties - The event properties.
   */
  capture(e: CaptureEvent): Promise<void>;

  /**
   * Get all configured MCP server connection status and tools.
   * Use {@link executeToolCall} to execute the tool.
   */
  readMcpStatus(): Promise<ThreadSignalSerialization<McpStatus>>;

  /**
   * get external rules like cursor rules.
   * @returns Array of external rule file paths
   */
  fetchThirdPartyRules(): Promise<{
    rulePaths: string[];
    workspaceRuleExists: boolean;
    copyRules: () => Promise<void>;
  }>;

  fetchAvailableThirdPartyMcpConfigs(): Promise<{
    availableConfigs: {
      name: string;
      path: string;
      description: string;
    }[];
    importFromAllConfigs: () => Promise<void>;
    importFromConfig: (configPath: {
      name: string;
      path: string;
      description: string;
    }) => Promise<void>;
    openConfig: (configPath: {
      name: string;
      path: string;
      description: string;
    }) => Promise<void>;
  }>;

  /**
   * Opens the specified URI in the user's default web browser or external application.
   * @param uri - The URI to open in an external application.
   */
  openExternal(uri: string): Promise<void>;

  /**
   * Saves a checkpoint with the given message.
   * @param message - The message to save as a checkpoint.
   * @returns A promise that resolves to a commit hash representing the saved checkpoint. If the repository is clean, it returns undefined.
   */
  saveCheckpoint(
    message: string,
    options?: SaveCheckpointOptions,
  ): Promise<string | null>;

  /**
   * Restores the checkpoint to the latest commit or a specific commit hash.
   * @param commitHash - The commit hash to restore to. If not provided, restores to the latest checkpoint.
   */
  restoreCheckpoint(commitHash?: string): Promise<void>;

  readCheckpointPath(): Promise<string | undefined>;

  /**
   * Reads user edits since the last checkpoint as diff stats.
   * @param fromCheckpoint - checkpoint hash to compare from.
   * @returns A promise that resolves to an array of file diff stats, or null if no edits.
   */
  diffWithCheckpoint(fromCheckpoint: string): Promise<UserEditsDiff[] | null>;

  /**
   * Shows the code diff between two checkpoints.
   * @param title - The title of the diff view.
   * @param checkpoint - An object containing the origin and modified checkpoint commits.
   * @param displayPath - The file path to display in the diff view. If not provided, the diff will be shown for all files.
   * @return A promise that resolves to a boolean indicating whether the diff was shown successfully.
   * If there is no diff, it resolves to false.
   */
  showCheckpointDiff(
    title: string,
    checkpoint: {
      origin: string;
      modified?: string;
    },
    displayPath?: string,
  ): Promise<boolean>;

  readExtensionVersion(): Promise<string>;

  readAutoSaveDisabled(): Promise<ThreadSignalSerialization<boolean>>;

  /**
   * Show an information message to users. Optionally provide an array of items which will be presented as
   * clickable buttons.
   *
   * @param message The message to show.
   * @param options Configures the behaviour of the message.
   * @param items A set of items that will be rendered as actions in the message.
   * @returns A thenable that resolves to the selected item or `undefined` when being dismissed.
   */
  showInformationMessage<T extends string>(
    message: string,
    options: { modal?: boolean; detail?: string },
    ...items: T[]
  ): Promise<T | undefined>;

  readModelList(): Promise<ThreadSignalSerialization<DisplayModel[]>>;

  readUserStorage(): Promise<
    ThreadSignalSerialization<Record<string, UserInfo>>
  >;
}

export interface WebviewHostApi {
  /**
   * @param params - Existing task id or new task params.
   */
  openTask(params: TaskIdParams | NewTaskParams): void;

  openTaskList(): void;

  openSettings(): void;

  onAuthChanged(): void;

  isFocused(): Promise<boolean>;
}
