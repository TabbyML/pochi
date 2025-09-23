import type { ThreadAbortSignalSerialization } from "@quilted/threads";
import type { ThreadSignalSerialization } from "@quilted/threads/signals";
import type { Environment } from "../base";

import type { UserInfo } from "../configuration";
import type {
  CaptureEvent,
  CustomAgentFile,
  DisplayModel,
  McpStatus,
  PochiCredentials,
  ResourceURI,
  RuleFile,
  SessionState,
  UserEditsDiff,
  VSCodeHostApi,
  WorkspaceState,
} from "./index";

const VSCodeHostStub = {
  readCurrentWorkspace: async () => {
    return Promise.resolve(undefined);
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
  readEnvironment: (_isSubTask?: boolean): Promise<Environment> => {
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
    },
  ): Promise<unknown> => {
    return Promise.resolve(undefined);
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
  listWorkflowsInWorkspace: (): Promise<
    { id: string; path: string; content: string }[]
  > => {
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
  readActiveSelection: (): Promise<
    ThreadSignalSerialization<
      Environment["workspace"]["activeSelection"] | undefined
    >
  > => {
    return Promise.resolve(
      {} as ThreadSignalSerialization<
        Environment["workspace"]["activeSelection"] | undefined
      >,
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
  restoreCheckpoint: async (): Promise<void> => {
    return Promise.resolve();
  },
  readCheckpointPath: async (): Promise<string | undefined> => {
    return Promise.resolve(undefined);
  },
  diffWithCheckpoint: async (
    _fromCheckpoint: string,
  ): Promise<UserEditsDiff[] | null> => {
    return Promise.resolve(null);
  },
  showCheckpointDiff: async (): Promise<boolean> => {
    return Promise.resolve(true);
  },
  readExtensionVersion: () => {
    return Promise.resolve("");
  },
  readAutoSaveDisabled: () => {
    return Promise.resolve({} as ThreadSignalSerialization<boolean>);
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
    return Promise.resolve({} as ThreadSignalSerialization<DisplayModel[]>);
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

  readMachineId: async (): Promise<string> => {
    return "test-machine-id";
  },
} satisfies VSCodeHostApi;

export function createVscodeHostStub(overrides?: Partial<VSCodeHostApi>) {
  return { ...VSCodeHostStub, ...overrides };
}
