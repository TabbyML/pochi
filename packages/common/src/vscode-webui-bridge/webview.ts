import type { CompiledToolPolicies } from "@getpochi/tools";
import type { ThreadAbortSignalSerialization } from "@quilted/threads";
import type { ThreadSignalSerialization } from "@quilted/threads/signals";
import type {
  ActiveSelection,
  AutoMemoryManager,
  AutoMemoryTaskState,
  AutoMemoryTranscriptEntry,
  BackgroundJobNotification,
  BackgroundTaskState,
  ContextWindowUsage,
  Environment,
  PastedTextFile,
  TaskHistoryContext,
  TaskMemoryState,
  TerminalTextSelection,
} from "../base";
import type { BrowserSession } from "../browser/types";
import type { UserInfo } from "../configuration";
import type { RecentFileState } from "../tool-utils";
import type {
  BuiltinSubAgentInfo,
  CaptureEvent,
  CustomAgentFile,
  ExecuteCommandResult,
  GitWorktree,
  McpConfigOverride,
  McpStatus,
  PochiTaskParams,
  ResourceURI,
  Review,
  RuleFile,
  SessionState,
  SkillFile,
  TaskArchivedParams,
  TaskPinnedParams,
  TaskStates,
  WorkspaceState,
} from "./index";
import type {
  BrowserAgentSettings,
  BrowserAgentSettingsUpdate,
} from "./types/browser-agent-settings";
import type { CreateWorktreeOptions, GithubIssue } from "./types/git";
import type { DisplayModel } from "./types/model";
import type { PochiCredentials } from "./types/pochi";
import type { QueuedUserInputRecord } from "./types/task";
import type { VSCodeSettings } from "./types/vscode-settings";

export type BackgroundCommands = Record<
  string,
  {
    isVisible: boolean;
    /**
     * `false` when the command has no terminal view (e.g. on Windows) and
     * only exposes its output file. Omitted means detachable.
     */
    detachable?: boolean;
    taskId?: string;
    command?: string;
    monitor?: string;
    outputFile?: string;
  }
>;

export interface VSCodeHostApi {
  readResourceURI(): Promise<ResourceURI>;

  readPochiCredentials(): Promise<PochiCredentials | null>;

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

  getGlobalState(key: string, defaultValue?: unknown): Promise<unknown>;

  setGlobalState(key: string, value: unknown): Promise<void>;

  readEnvironment(options: {
    omitCustomRules?: boolean;
    webviewKind: "sidebar" | "pane";
    taskId?: string;
    /**
     * The task's own cwd (`task.cwd` in the store), e.g. the isolated worktree
     * of a subagent. Defaults to the workspace cwd.
     */
    cwd?: string;
  }): Promise<Environment>;

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
      contentType?: string[];
      builtinSubAgentInfo?: BuiltinSubAgentInfo;
      toolPolicies?: CompiledToolPolicies;
      storeId: string;
      taskId: string;
      allowBackground?: boolean;
      /**
       * The task's own cwd (`task.cwd` in the store), e.g. the isolated
       * worktree of a subagent. Defaults to the workspace cwd.
       */
      cwd?: string;
    },
  ): Promise<unknown>;

  /**
   * Compute a preview diff for a file-editing tool call (applyDiff,
   * multiApplyDiff, writeToFile) WITHOUT writing to disk.
   *
   * This is used to show the diff before the user approves the tool call.
   * Returns `undefined` when no preview can be computed (e.g. non-editing tool,
   * search content does not match, or there are no changes).
   */
  previewEdit(
    toolName: string,
    input: unknown,
  ): Promise<
    | {
        edit: string;
        editSummary: { added: number; removed: number };
      }
    | undefined
  >;

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

  readPochiTabs(): Promise<ThreadSignalSerialization<TaskStates>>;

  /**
   * Closes all Pochi tabs with the given uid (task id).
   * If uid is not provided, closes all Pochi tabs.
   * @param uid - Optional task id to filter tabs to close.
   */
  closePochiTabs(uid?: string): Promise<void>;

  /**
   * Clear the file state cache for the given task ID.
   * Called after compaction to prevent stale "file unchanged" stubs
   * from being returned for content that was compacted away.
   */
  clearFileStateCache(taskId: string): Promise<void>;

  /**
   * The cwd a subagent task runs in under worktree isolation, known before
   * the worktree is created. Undefined outside a git repository.
   */
  readSubagentWorktreePath(taskId: string): Promise<string | undefined>;

  /**
   * Create the isolated worktree a subagent task runs in. It is discarded
   * once the parent task is archived.
   */
  createSubagentWorktree(
    taskId: string,
    parentTaskId?: string,
  ): Promise<{ path: string; branch: string }>;

  /**
   * Remove a subagent task's worktree if it holds no changes. Returns
   * undefined when the task has no isolated worktree.
   */
  finalizeSubagentWorktree(
    taskId: string,
  ): Promise<{ path: string; branch: string; removed: boolean } | undefined>;

  /**
   * Copy a parent task's file state cache to a fork task. Only forks inherit
   * the parent conversation, so only they can resolve "file unchanged" stubs
   * that point at the parent's read results.
   */
  forkFileStateCache(sourceTaskId: string, targetTaskId: string): Promise<void>;

  /**
   * Read recent file state cache entries for the given task ID.
   * Used by compaction to keep recently read file contents visible after
   * the compacted conversation drops the original readFile tool results.
   */
  readRecentFilesForCompact(taskId: string): Promise<RecentFileState[]>;

  readActiveSelection(): Promise<
    ThreadSignalSerialization<ActiveSelection | undefined>
  >;

  readVisibleTerminals(): Promise<{
    terminals: ThreadSignalSerialization<
      Environment["workspace"]["terminals"] | undefined
    >;
    openBackgroundJobTerminal: (backgroundJobId: string) => Promise<void>;
  }>;

  readBackgroundCommands(): Promise<{
    backgroundCommands: ThreadSignalSerialization<BackgroundCommands>;
    show: (backgroundJobId: string) => Promise<void>;
    hide: (backgroundJobId: string) => Promise<void>;
    close: (backgroundJobId: string) => Promise<void>;
  }>;

  readBackgroundJobNotifications(taskId: string): Promise<{
    notifications: ThreadSignalSerialization<BackgroundJobNotification[]>;
    snapshotPending: () => Promise<BackgroundJobNotification[]>;
    acknowledge: (notificationId: string) => Promise<void>;
  }>;

  /** Reads the user messages queued for a task while its agent was busy. */
  readQueuedUserInputs(taskId: string): Promise<QueuedUserInputRecord[]>;

  /** Replaces the user messages queued for a task. */
  saveQueuedUserInputs(
    taskId: string,
    inputs: QueuedUserInputRecord[],
  ): Promise<void>;

  persistPastedTextFiles(
    taskId: string,
    texts: string[],
  ): Promise<PastedTextFile[]>;

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
      cellId?: string;
      /**
       * The passed in taskId parameter is always the top level parameter in the task, (e.g even for a tool call from a subtask, it's still invoked with its parent task's call)
       */
      taskId?: string;
    },
  ): void;

  /**
   * Asks the user where to store a standalone widget document and writes it there.
   *
   * @returns `true` when the document was written, `false` when the user cancelled.
   */
  saveWidget(html: string, suggestedFilename: string): Promise<boolean>;

  /**
   * Opens a standalone widget document in a new editor tab. The document is
   * rendered from the given string and is never written to disk.
   */
  openWidgetInPanel(html: string, title: string): Promise<void>;

  readCurrentWorkspace(): Promise<{
    cwd: string | null;
    workspacePath: string | null;
  }>;

  /**
   * Reports that this webview's window gained or lost focus. Used to track,
   * per Pochi surface (sidebar vs. a task tab's panel), when it was last
   * focused by the user. There is no VS Code host-native signal for "the
   * sidebar view gained keyboard focus" (unlike editor tabs, which are
   * tracked via `vscode.window.tabGroups`), so the webview reports it
   * directly via this method.
   */
  notifyFocusChanged(focused: boolean): Promise<void>;

  readCustomAgents(): Promise<ThreadSignalSerialization<CustomAgentFile[]>>;

  readSkills(): Promise<ThreadSignalSerialization<SkillFile[]>>;

  executeBashCommand: (
    command: string,
    abortSignal: ThreadAbortSignalSerialization,
  ) => Promise<{ output: string; error?: string }>;

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

  readExtensionVersion(): Promise<string>;

  readVSCodeSettings(): Promise<ThreadSignalSerialization<VSCodeSettings>>;

  updateVSCodeSettings(params: Partial<VSCodeSettings>): Promise<void>;

  readBrowserAgentSettings(): Promise<{
    browserSettings: ThreadSignalSerialization<BrowserAgentSettings>;
    updateBrowserAgentSettings: (
      params: BrowserAgentSettingsUpdate,
    ) => Promise<void>;
  }>;

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

  showWarningMessage<T extends string>(
    message: string,
    options: { modal?: boolean; detail?: string },
    ...items: T[]
  ): Promise<T | undefined>;

  readModelList(): Promise<{
    modelList: ThreadSignalSerialization<DisplayModel[]>;
    isLoading: ThreadSignalSerialization<boolean>;
    reload: () => Promise<void>;
  }>;

  readUserStorage(): Promise<
    ThreadSignalSerialization<Record<string, UserInfo>>
  >;

  /**
   * create or open a task in a new panel
   */
  openTaskInPanel(
    params: PochiTaskParams,
    options?: {
      keepEditor?: boolean;
      preserveFocus?: boolean;
      preview?: boolean;
      /**
       * If true, open the task tab without leaving it in front: the tab is
       * shown just long enough for its webview to start, then the previously
       * active tab of that editor group is restored.
       */
      background?: boolean;
    },
  ): Promise<void>;

  openBrowserAgentSettingsPanel(): void;

  sendTaskNotification(
    kind: "failed" | "completed" | "pending-tool" | "pending-input",
    params: { uid: string; isSubTask?: boolean },
  ): Promise<void>;

  onTaskUpdated(taskData: unknown): Promise<void>;

  onTaskRunning(taskId: string): Promise<void>;

  readWorktrees(): Promise<{
    worktrees: ThreadSignalSerialization<GitWorktree[]>;
    gh: ThreadSignalSerialization<{
      installed: boolean;
      authorized: boolean;
    }>;
    gitOriginUrl: string | null;
  }>;

  createWorktree(options?: CreateWorktreeOptions): Promise<GitWorktree | null>;

  deleteWorktree(
    worktreePath: string,
    options?: {
      /** Also delete the worktree's branch. */
      deleteBranch?: boolean;
    },
  ): Promise<boolean>;

  queryGithubIssues(query?: string): Promise<GithubIssue[]>;

  readGitBranches(): Promise<string[]>;

  readReviews(): Promise<ThreadSignalSerialization<Review[]>>;

  deleteReviews(reviewIds: string[]): Promise<void>;

  openReview(
    review: Review,
    options?: { focusCommentsPanel?: boolean; revealRange?: boolean },
  ): Promise<void>;

  readTasks(): Promise<ThreadSignalSerialization<Record<string, unknown>>>;

  readBrowserSession(
    taskId: string,
  ): Promise<ThreadSignalSerialization<BrowserSession | undefined>>;

  registerBrowserSession(
    taskId: string,
    parentId?: string,
  ): Promise<BrowserSession>;

  unregisterBrowserSession(taskId: string): Promise<void>;

  /**
   * Read mcpConfigOverride for a task.
   * Returns a serialized signal for the value and a setter function.
   */
  readMcpConfigOverride(taskId: string): Promise<{
    value: ThreadSignalSerialization<McpConfigOverride | undefined>;
    setMcpConfigOverride: (
      mcpConfigOverride: McpConfigOverride,
    ) => Promise<McpConfigOverride>;
  }>;

  readContextWindowUsage(taskId: string): Promise<{
    value: ThreadSignalSerialization<ContextWindowUsage | undefined>;
    setContextWindowUsage: (
      contextWindowUsage: ContextWindowUsage,
    ) => Promise<void>;
  }>;

  readTaskMemoryState(taskId: string): Promise<{
    value: ThreadSignalSerialization<TaskMemoryState | undefined>;
    setTaskMemoryState: (state: TaskMemoryState) => Promise<void>;
  }>;

  readAutoMemoryEnabled(): Promise<{
    value: ThreadSignalSerialization<boolean>;
    setAutoMemoryEnabled: (enabled: boolean) => Promise<void>;
  }>;

  /**
   * Read the global effective context window (in tokens) used to cap
   * auto-compaction. Returns undefined when not configured, in which case the
   * built-in default is used.
   *
   * Returns a signal so the UI can react to configuration changes in real time.
   */
  readEffectiveContextWindow(): Promise<
    ThreadSignalSerialization<number | undefined>
  >;

  readAutoMemoryState(taskId: string): Promise<{
    value: ThreadSignalSerialization<AutoMemoryTaskState | undefined>;
    setAutoMemoryState: (state: AutoMemoryTaskState) => Promise<void>;
  }>;

  readAutoMemory(): Promise<AutoMemoryManager>;

  /**
   * List past tasks of the current repo that have a stored transcript and can be
   * referenced from another task, newest first.
   */
  listReferenceableTasks(
    excludeTaskId?: string,
  ): Promise<AutoMemoryTranscriptEntry[]>;

  /**
   * Where the workspace repository's task transcripts and their index live,
   * or undefined when there is no readable index. An existing index is
   * returned at once and refreshed in the background.
   */
  readTaskHistoryContext(): Promise<TaskHistoryContext | undefined>;

  /** Writes a background subagent's transcript, see `getSubagentTranscriptPath`. */
  writeSubagentTranscript(options: {
    parentTaskId: string;
    taskId: string;
    cwd?: string;
    title?: string;
    status?: string;
    updatedAt?: number;
    transcript: string;
  }): Promise<void>;

  readBackgroundTaskState(taskId: string): Promise<{
    value: ThreadSignalSerialization<BackgroundTaskState | undefined>;
    setBackgroundTaskState: (state: BackgroundTaskState) => Promise<void>;
  }>;

  /**
   * Read and manage archived state for a task.
   * Returns a serialized signal for the archived value and a setter function.
   */
  readTaskArchived(): Promise<{
    value: ThreadSignalSerialization<Record<string, boolean>>;
    hasArchivableTasks: ThreadSignalSerialization<boolean>;
    setTaskArchived: (params: TaskArchivedParams) => Promise<void>;
  }>;

  /**
   * Read and manage pinned state for tasks.
   * Returns a serialized signal for the pinned value map and a setter function.
   */
  readTaskPinned(): Promise<{
    value: ThreadSignalSerialization<Record<string, boolean>>;
    setTaskPinned: (params: TaskPinnedParams) => Promise<void>;
  }>;

  readLang(): Promise<{
    value: ThreadSignalSerialization<string>;
    updateLang: (lang: string) => Promise<void>;
  }>;
}

export interface WebviewHostApi {
  openTaskList(): void;

  openSettings(): void;

  onAuthChanged(): void;

  isFocused(): Promise<boolean>;

  writeStoreFile(filePath: string, content: string): Promise<void>;

  readStoreFile(filePath: string): Promise<string | null>;

  readTaskOutput(taskId: string): Promise<ExecuteCommandResult>;

  /**
   * Pushes a terminal text selection into the webview's pending "terminal
   * context" list, so it shows up attached to the next outgoing chat
   * message. Invoked from the VS Code side (e.g. the terminal right-click
   * "Add to Chat" command).
   *
   * Resolves once the selection has been handed off to the webview's
   * terminal context state (awaiting readiness rather than dropping it if
   * the webview hasn't finished initializing yet).
   */
  addTerminalContext(selection: TerminalTextSelection): Promise<void>;
}
