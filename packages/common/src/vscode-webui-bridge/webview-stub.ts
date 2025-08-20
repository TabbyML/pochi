import type { ThreadAbortSignalSerialization } from "@quilted/threads";
import type { ThreadSignalSerialization } from "@quilted/threads/signals";
import type { Environment } from "../base";

import type {
  CaptureEvent,
  CustomModelSetting,
  McpStatus,
  ResourceURI,
  RuleFile,
  SessionState,
  UserEditsDiff,
  VSCodeHostApi,
  VSCodeLmModel,
  WorkspaceState,
} from "./index";

const VSCodeHostStub = {
  readCurrentWorkspace: async () => {
    return Promise.resolve(undefined);
  },
  readResourceURI: (): Promise<ResourceURI> => {
    return Promise.resolve({} as ResourceURI);
  },
  readToken: (): Promise<ThreadSignalSerialization<string | undefined>> => {
    return Promise.resolve({} as ThreadSignalSerialization<string | undefined>);
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
  readEnvironment: (): Promise<Environment> => {
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
  openSymbol: (_symbol: string): Promise<void> => {
    return Promise.resolve();
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
  closeCurrentWorkspace: (): void => {},
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
  readCustomModelSetting: async (): Promise<
    ThreadSignalSerialization<CustomModelSetting[] | undefined>
  > => {
    return Promise.resolve(
      {} as ThreadSignalSerialization<CustomModelSetting[] | undefined>,
    );
  },
  readVSCodeLm: async (): Promise<{
    models: ThreadSignalSerialization<VSCodeLmModel[]>;
    enabled: ThreadSignalSerialization<boolean>;
    enable: () => void;
    disable: () => void;
  }> => {
    return Promise.resolve({
      models: {} as ThreadSignalSerialization<VSCodeLmModel[]>,
      enabled: {} as ThreadSignalSerialization<boolean>,
      enable: () => {},
      disable: () => {},
    });
  },
  vscodeLmRequest: async (): Promise<void> => {
    return Promise.resolve();
  },
} satisfies VSCodeHostApi;

export function createVscodeHostStub(overrides?: Partial<VSCodeHostApi>) {
  return { ...VSCodeHostStub, ...overrides };
}
