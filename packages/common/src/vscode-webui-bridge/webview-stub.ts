import type { ThreadAbortSignalSerialization } from "@quilted/threads";
import type { ThreadSignalSerialization } from "@quilted/threads/signals";
import type { Environment } from "../base";
import type { UserInfo } from "../configuration";
import type {
  BrowserSession,
  BuiltinSubAgentInfo,
  CaptureEvent,
  CustomAgentFile,
  DisplayModel,
  FileDiff,
  GitWorktree,
  GithubIssue,
  McpConfigOverride,
  McpStatus,
  PochiCredentials,
  PochiTaskParams,
  ResourceURI,
  Review,
  RuleFile,
  SessionState,
  SkillFile,
  TaskArchivedParams,
  TaskChangedFile,
  TaskStates,
  VSCodeHostApi,
  VSCodeSettings,
  WorkspaceState,
} from "./index";
import type { ActiveSelection } from "./types/message";

const VSCodeHostStub = {
  readCurrentWorkspace: async () => {
    return Promise.resolve({ cwd: null, workspacePath: null });
  },
  readResourceURI: (): Promise<ResourceURI> => {
    return Promise.resolve({} as ResourceURI);
  },
  readPochiCredentials: (): Promise<PochiCredentials | null> => {
    return Promise.resolve({} as PochiCredentials | null);
  },
  getSessionState: <K extends keyof SessionState>(
    _keys?: K[],
  ): Promise<Pick<SessionState, K>> => {
    return Promise.resolve({} as Pick<SessionState, K>);
  },
  setSessionState: (_state: Partial<SessionState>): Promise<void> => {
    return Promise.resolve();
  },
  getWorkspaceState: <K extends keyof WorkspaceState>(
    _key: K,
  ): Promise<WorkspaceState[K]> => {
    return Promise.resolve({} as WorkspaceState[K]);
  },
  setWorkspaceState: <K extends keyof WorkspaceState>(
    _key: K,
    _value: WorkspaceState[K],
  ): Promise<void> => {
    return Promise.resolve();
  },
  readEnvironment: (_options: {
    isSubTask?: boolean;
    webviewKind: "sidebar" | "pane";
  }): Promise<Environment> => {
    return Promise.resolve({} as Environment);
  },
  previewToolCall: (
    _toolName: string,
    _args: unknown,
    _options: {
      toolCallId: string;
      state: "partial-call" | "call" | "result";
    },
  ): Promise<{ error: string } | undefined> => {
    return Promise.resolve(undefined);
  },
  executeToolCall: (
    _toolName: string,
    _args: unknown,
    _options: {
      toolCallId: string;
      abortSignal: ThreadAbortSignalSerialization;
      builtinSubAgentInfo?: BuiltinSubAgentInfo;
    },
  ): Promise<unknown> => {
    return Promise.resolve(undefined);
  },
  executeBashCommand: (
    _command: string,
    _abortSignal: ThreadAbortSignalSerialization,
  ): Promise<{ output: string; error?: string }> => {
    return Promise.resolve({} as { output: string; error?: string });
  },
  listFilesInWorkspace: (): Promise<{ filepath: string; isDir: boolean }[]> => {
    return Promise.resolve([{ filepath: "test", isDir: false }]);
  },
  listAutoCompleteCandidates(): Promise<string[]> {
    return Promise.resolve([]);
  },
  listRuleFiles: (): Promise<RuleFile[]> => {
    return Promise.resolve([]);
  },
  readActiveTabs: (): Promise<
    ThreadSignalSerialization<Array<{ filepath: string; isDir: boolean }>>
  > => {
    return Promise.resolve(
      {} as ThreadSignalSerialization<
        Array<{ filepath: string; isDir: boolean }>
      >,
    );
  },
  readPochiTabs: (): Promise<ThreadSignalSerialization<TaskStates>> => {
    return Promise.resolve({} as ThreadSignalSerialization<TaskStates>);
  },
  readActiveSelection: (): Promise<
    ThreadSignalSerialization<ActiveSelection | undefined>
  > => {
    return Promise.resolve(
      {} as ThreadSignalSerialization<ActiveSelection | undefined>,
    );
  },
  openFile: (
    _filePath: string,
    _options?: { start?: number; end?: number; preserveFocus?: boolean },
  ): void => {},
  capture: (_e: CaptureEvent): Promise<void> => {
    return Promise.resolve();
  },
  readMcpStatus: (): Promise<ThreadSignalSerialization<McpStatus>> => {
    return Promise.resolve({} as ThreadSignalSerialization<McpStatus>);
  },
  fetchThirdPartyRules: (): Promise<{
    rulePaths: string[];
    workspaceRuleExists: boolean;
    copyRules: () => Promise<void>;
  }> => {
    return Promise.resolve({
      rulePaths: [],
      workspaceRuleExists: false,
      copyRules: () => Promise.resolve(),
    });
  },
  fetchAvailableThirdPartyMcpConfigs: (): Promise<{
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
  }> => {
    return Promise.resolve({
      availableConfigs: [],
      importFromAllConfigs: () => Promise.resolve(),
      importFromConfig: () => Promise.resolve(),
      openConfig: () => Promise.resolve(),
    });
  },
  openExternal: (_uri: string): Promise<void> => {
    return Promise.resolve();
  },
  readMinionId: async () => {
    return Promise.resolve(null);
  },
  saveCheckpoint: async (): Promise<string | null> => {
    return "";
  },
  restoreCheckpoint: async (
    _commitHash: string,
    _files?: string[],
  ): Promise<void> => {
    return Promise.resolve();
  },
  restoreChangedFiles: async (_files: TaskChangedFile[]): Promise<void> => {
    return Promise.resolve();
  },
  readLatestCheckpoint: async (): Promise<
    ThreadSignalSerialization<string | null>
  > => {
    return Promise.resolve({} as ThreadSignalSerialization<string | null>);
  },
  readCheckpointPath: async (): Promise<string | undefined> => {
    return Promise.resolve(undefined);
  },
  diffWithCheckpoint: async (
    _fromCheckpoint: string,
  ): Promise<FileDiff[] | null> => {
    return Promise.resolve(null);
  },
  showCheckpointDiff: async (): Promise<boolean> => {
    return Promise.resolve(true);
  },
  diffChangedFiles: async (
    _changedFiles: TaskChangedFile[],
  ): Promise<TaskChangedFile[]> => {
    return Promise.resolve([]);
  },
  showChangedFiles: async (
    _changedFiles: TaskChangedFile[],
  ): Promise<boolean> => {
    return Promise.resolve(true);
  },
  readExtensionVersion: () => {
    return Promise.resolve("");
  },
  readVSCodeSettings: () => {
    return Promise.resolve({} as ThreadSignalSerialization<VSCodeSettings>);
  },
  updateVSCodeSettings: (_params: Partial<VSCodeSettings>) => {
    return Promise.resolve();
  },
  showInformationMessage: async (): Promise<undefined> => {
    return Promise.resolve(undefined);
  },
  readVisibleTerminals: async (): Promise<{
    terminals: ThreadSignalSerialization<
      Environment["workspace"]["terminals"] | undefined
    >;
    openBackgroundJobTerminal: (backgroundJobId: string) => Promise<void>;
  }> => {
    return Promise.resolve({
      terminals: {} as ThreadSignalSerialization<
        Environment["workspace"]["terminals"] | undefined
      >,
      openBackgroundJobTerminal: async (
        _backgroundJobId: string,
      ): Promise<void> => {
        return Promise.resolve();
      },
    });
  },
  readModelList: async () => {
    return Promise.resolve(
      {} as {
        modelList: ThreadSignalSerialization<DisplayModel[]>;
        isLoading: ThreadSignalSerialization<boolean>;
        reload: () => Promise<void>;
      },
    );
  },
  readUserStorage: async () => {
    return Promise.resolve(
      {} as ThreadSignalSerialization<Record<string, UserInfo>>,
    );
  },
  readCustomAgents: async (): Promise<
    ThreadSignalSerialization<CustomAgentFile[]>
  > => {
    return Promise.resolve({} as ThreadSignalSerialization<CustomAgentFile[]>);
  },

  readSkills: async (): Promise<ThreadSignalSerialization<SkillFile[]>> => {
    return Promise.resolve({} as ThreadSignalSerialization<SkillFile[]>);
  },

  openTaskInPanel: async (
    _params: PochiTaskParams,
    _options?: {
      keepEditor?: boolean;
      preserveFocus?: boolean;
    },
  ): Promise<void> => {},

  sendTaskNotification: async (): Promise<void> => {},

  onTaskUpdated: async (): Promise<void> => {},

  onTaskRunning: async (_taskId: string): Promise<void> => {},

  readWorktrees: async (): Promise<{
    worktrees: ThreadSignalSerialization<GitWorktree[]>;
    gh: ThreadSignalSerialization<{
      installed: boolean;
      authorized: boolean;
    }>;
    gitOriginUrl: string | null;
  }> => {
    return Promise.resolve(
      {} as {
        worktrees: ThreadSignalSerialization<GitWorktree[]>;
        gh: ThreadSignalSerialization<{
          installed: boolean;
          authorized: boolean;
        }>;
        gitOriginUrl: string | null;
      },
    );
  },

  createWorktree: async (): Promise<GitWorktree | null> => {
    return Promise.resolve({} as GitWorktree);
  },

  deleteWorktree: async (): Promise<boolean> => false,

  queryGithubIssues: async (): Promise<GithubIssue[]> => [],

  readGitBranches: async (): Promise<string[]> => [],

  readReviews: (): Promise<ThreadSignalSerialization<Review[]>> => {
    return Promise.resolve({} as ThreadSignalSerialization<Review[]>);
  },

  clearReviews: async (): Promise<void> => {},

  openReview: async (
    _review: Review,
    _options?: { focusCommentsPanel?: boolean; revealRange?: boolean },
  ) => {},

  readUserEdits: async (
    _uid: string,
  ): Promise<ThreadSignalSerialization<FileDiff[]>> => {
    return Promise.resolve({} as ThreadSignalSerialization<FileDiff[]>);
  },

  getGlobalState: async (): Promise<unknown> => {
    return null;
  },

  setGlobalState: async (): Promise<void> => {},
  readTasks: (): Promise<ThreadSignalSerialization<Record<string, unknown>>> =>
    Promise.resolve({} as ThreadSignalSerialization<Record<string, unknown>>),
  readBrowserSession: (
    _taskId: string,
  ): Promise<ThreadSignalSerialization<BrowserSession | undefined>> =>
    Promise.resolve(
      {} as ThreadSignalSerialization<BrowserSession | undefined>,
    ),
  registerBrowserSession: (_taskId: string): Promise<void> => Promise.resolve(),
  unregisterBrowserSession: (_taskId: string): Promise<void> =>
    Promise.resolve(),
  readMcpConfigOverride: async (
    _taskId: string,
  ): Promise<{
    value: ThreadSignalSerialization<McpConfigOverride | undefined>;
    setMcpConfigOverride: (
      mcpConfigOverride: McpConfigOverride,
    ) => Promise<McpConfigOverride>;
  }> => {
    return {
      value: {} as ThreadSignalSerialization<McpConfigOverride | undefined>,
      setMcpConfigOverride: (mcpConfigOverride: McpConfigOverride) =>
        Promise.resolve(mcpConfigOverride),
    };
  },
  readTaskArchived(): Promise<{
    value: ThreadSignalSerialization<Record<string, boolean>>;
    hasArchivableTasks: ThreadSignalSerialization<boolean>;
    setTaskArchived: (params: TaskArchivedParams) => Promise<void>;
  }> {
    return Promise.resolve({
      value: {} as ThreadSignalSerialization<Record<string, boolean>>,
      hasArchivableTasks: {} as ThreadSignalSerialization<boolean>,
      setTaskArchived: (_params: TaskArchivedParams) => Promise.resolve(),
    });
  },

  readLang: async (): Promise<{
    value: ThreadSignalSerialization<string>;
    updateLang: (lang: string) => Promise<void>;
  }> => {
    return {
      value: {} as ThreadSignalSerialization<string>,
      updateLang: (_lang: string) => Promise.resolve(),
    };
  },

  readForkTaskStatus: async (): Promise<{
    status: ThreadSignalSerialization<Record<string, "inProgress" | "ready">>;
    setForkTaskStatus: () => Promise<void>;
  }> => {
    return {
      status: {} as ThreadSignalSerialization<
        Record<string, "inProgress" | "ready">
      >,
      setForkTaskStatus: () => Promise.resolve(),
    };
  },
} satisfies VSCodeHostApi;

export function createVscodeHostStub(overrides?: Partial<VSCodeHostApi>) {
  return { ...VSCodeHostStub, ...overrides };
}
