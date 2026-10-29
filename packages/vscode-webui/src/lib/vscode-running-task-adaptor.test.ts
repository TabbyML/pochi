// @vitest-environment node
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import { readMediaFile } from "@getpochi/common/tool-utils";
import type {
  DisplayModel,
  ValidCustomAgentFile,
} from "@getpochi/common/vscode-webui-bridge";
import { serializeThreadSignalWithSnapshot } from "@getpochi/common/vscode-webui-bridge/thread-signal";
import { findBlob } from "@getpochi/livekit";
import { MediaOutput } from "@getpochi/tools";
import { signal } from "@preact/signals-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserSessionManager } from "./browser-session-manager";
import { blobStore } from "./remote-blob-store";
import { vscodeHost } from "./vscode";
import { VscodeRunningTaskAdaptor } from "./vscode-running-task-adaptor";

const settings = vi.hoisted(() => ({ selectedModel: { id: "pochi/text" } }));
vi.mock("../features/settings/store", () => ({
  useSettingsStore: { getState: () => settings },
}));
vi.mock("./vscode", () => ({
  vscodeHost: {
    executeToolCall: vi.fn(),
    readModelList: vi.fn(),
    readMcpStatus: vi.fn(),
    readCustomAgents: vi.fn(),
    readSkills: vi.fn(),
    readEffectiveContextWindow: vi.fn(),
    readEnvironment: vi.fn(),
    finalizeSubagentWorktree: vi.fn(),
    readBrowserAgentSettings: vi.fn(),
  },
}));
vi.mock("./browser-session-manager", () => ({
  browserSessionManager: {
    isRegistered: vi.fn(),
    registerSession: vi.fn(),
    unregisterSession: vi.fn(),
  },
}));
vi.mock("./remote-blob-store", () => ({
  blobStore: { protocol: "https:", put: vi.fn(), get: vi.fn() },
}));

const models: DisplayModel[] = [
  {
    type: "vendor",
    id: "pochi/text",
    name: "Text model",
    vendorId: "pochi",
    modelId: "text",
    options: {},
    getCredentials: async () => ({}),
  },
  {
    type: "vendor",
    id: "pochi/vision",
    name: "Vision model",
    vendorId: "pochi",
    modelId: "vision",
    options: {},
    contentType: ["image/png"],
    getCredentials: async () => ({}),
  },
];
const agents: ValidCustomAgentFile[] = ["text", "vision", "missing"].map(
  (name) => ({
    name,
    description: name,
    systemPrompt: name,
    filePath: `${name}.md`,
    model: `pochi/${name}`,
  }),
);

describe("VscodeRunningTaskAdaptor media", () => {
  let adaptor: VscodeRunningTaskAdaptor;

  beforeEach(async () => {
    vi.resetAllMocks();
    settings.selectedModel.id = "pochi/text";
    vi.mocked(vscodeHost.readModelList).mockResolvedValue({
      modelList: serializeThreadSignalWithSnapshot(signal(models)),
      isLoading: serializeThreadSignalWithSnapshot(signal(false)),
      reload: vi.fn(async () => {}),
    });
    vi.mocked(vscodeHost.readMcpStatus).mockResolvedValue(
      serializeThreadSignalWithSnapshot(
        signal({ connections: {}, toolset: {}, instructions: "" }),
      ),
    );
    vi.mocked(vscodeHost.readCustomAgents).mockResolvedValue(
      serializeThreadSignalWithSnapshot(signal(agents)),
    );
    vi.mocked(vscodeHost.readSkills).mockResolvedValue(
      serializeThreadSignalWithSnapshot(signal([])),
    );
    vi.mocked(vscodeHost.readEffectiveContextWindow).mockResolvedValue(
      serializeThreadSignalWithSnapshot(signal(undefined)),
    );
    vi.mocked(vscodeHost.executeToolCall).mockResolvedValue({
      content: "hello",
      isTruncated: false,
    });
    adaptor = new VscodeRunningTaskAdaptor();
    await adaptor.waitUntilReady();
  });

  afterEach(() => adaptor.dispose());

  function readFile(
    taskId = "child",
    abortSignal = new AbortController().signal,
  ) {
    return adaptor.executeToolCall({
      taskId,
      storeId: "store",
      toolName: "readFile",
      toolCallId: `${taskId}-read`,
      input: { path: "screenshot.png" },
      abortSignal,
      toolPolicies: undefined,
    });
  }

  it.each([
    { selectedModel: "vision", agentType: undefined, expected: ["image/png"] },
    { selectedModel: "text", agentType: "vision", expected: ["image/png"] },
    { selectedModel: "vision", agentType: "text", expected: undefined },
    { selectedModel: "vision", agentType: "missing", expected: ["image/png"] },
  ])(
    "uses the task model's media capabilities ($agentType / $selectedModel)",
    async ({ selectedModel, agentType, expected }) => {
      settings.selectedModel.id = `pochi/${selectedModel}`;
      await adaptor.resolveTaskLLM({
        taskId: "child",
        cwd: "/repo",
        taskState: { parentTaskId: "parent", agentType },
      });
      await readFile();
      expect(
        vi.mocked(vscodeHost.executeToolCall).mock.calls[0][2].contentType,
      ).toEqual(expected);
    },
  );

  it("keeps overrides task-scoped and clears them when a task falls back to the default model", async () => {
    await adaptor.resolveTaskLLM({
      taskId: "child",
      cwd: "/repo",
      taskState: { agentType: "vision" },
    });
    await readFile("child");
    await readFile("sibling");
    await adaptor.resolveTaskLLM({
      taskId: "child",
      cwd: "/repo",
      taskState: {},
    });
    await readFile("child");
    expect(
      vi
        .mocked(vscodeHost.executeToolCall)
        .mock.calls.map((call) => call[2].contentType),
    ).toEqual([["image/png"], undefined, undefined]);
  });

  it("stores image bytes as a blob that the model can load", async () => {
    const data = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const base64 = Buffer.from(data).toString("base64");
    const url = "https://blob.example/screenshot.png";
    const abortSignal = new AbortController().signal;
    settings.selectedModel.id = "pochi/vision";
    vi.mocked(vscodeHost.executeToolCall).mockImplementation(
      async (_tool, _input, options) =>
        readMediaFile("screenshot.png", data, options.contentType ?? []),
    );
    vi.mocked(blobStore.put).mockResolvedValue(url);
    vi.mocked(blobStore.get).mockResolvedValue({ data, mimeType: "image/png" });

    const output = MediaOutput.parse(await readFile("child", abortSignal));

    expect(output).toEqual({ type: "media", mimeType: "image/png", data: url });
    expect(blobStore.put).toHaveBeenCalledWith(data, "image/png", abortSignal);
    expect(
      await findBlob(blobStore, new URL(output.data), output.mimeType)?.data,
    ).toBe(base64);
  });

  it("leaves text results unchanged without creating a blob", async () => {
    expect(await readFile()).toEqual({ content: "hello", isTruncated: false });
    expect(blobStore.put).not.toHaveBeenCalled();
  });
});

describe("VscodeRunningTaskAdaptor task cwd", () => {
  let adaptor: VscodeRunningTaskAdaptor;
  const worktree = "/repo.worktree/subagent-1";

  beforeEach(() => {
    vi.resetAllMocks();
    // Never initializes: these tests don't depend on models or agents.
    const pending = () => new Promise<never>(() => {});
    vi.mocked(vscodeHost.readModelList).mockImplementation(pending);
    vi.mocked(vscodeHost.readMcpStatus).mockImplementation(pending);
    vi.mocked(vscodeHost.readCustomAgents).mockImplementation(pending);
    vi.mocked(vscodeHost.readSkills).mockImplementation(pending);
    vi.mocked(vscodeHost.readEffectiveContextWindow).mockImplementation(
      pending,
    );
    vi.mocked(vscodeHost.executeToolCall).mockResolvedValue({ ok: true });
    adaptor = new VscodeRunningTaskAdaptor();
  });

  afterEach(() => adaptor.dispose());

  it("runs a task's environment and tools in the task's cwd", async () => {
    await adaptor
      .getRequestGetters({ taskId: "child", cwd: worktree })
      .getEnvironment();
    await adaptor.executeToolCall({
      taskId: "child",
      storeId: "store",
      toolName: "readFile",
      toolCallId: "read",
      input: { path: "a.txt" },
      abortSignal: new AbortController().signal,
      toolPolicies: undefined,
      cwd: worktree,
    });
    expect(vi.mocked(vscodeHost.readEnvironment).mock.calls[0][0]).toMatchObject(
      { taskId: "child", cwd: worktree },
    );
    expect(vi.mocked(vscodeHost.executeToolCall).mock.calls[0][2]).toMatchObject(
      { taskId: "child", cwd: worktree },
    );
  });

  it("reports the fate of the task's worktree when it finishes", async () => {
    vi.mocked(vscodeHost.finalizeSubagentWorktree)
      .mockResolvedValueOnce({ path: worktree, branch: "b", removed: true })
      .mockResolvedValueOnce({ path: worktree, branch: "b", removed: false })
      .mockResolvedValueOnce(undefined);
    expect(await adaptor.onTaskFinished("child")).toContain("was removed");
    expect(await adaptor.onTaskFinished("child")).toContain(
      "not applied to the current workspace",
    );
    expect(await adaptor.onTaskFinished("child")).toBeUndefined();
  });
});

describe("VscodeRunningTaskAdaptor browser subagent", () => {
  const storeId = encodeStoreId(null, "parent");

  beforeEach(() => {
    vi.resetAllMocks();
    const pending = () => new Promise<never>(() => {});
    vi.mocked(vscodeHost.readModelList).mockImplementation(pending);
    vi.mocked(vscodeHost.readMcpStatus).mockImplementation(pending);
    vi.mocked(vscodeHost.readCustomAgents).mockImplementation(pending);
    vi.mocked(vscodeHost.readSkills).mockImplementation(pending);
    vi.mocked(vscodeHost.readEffectiveContextWindow).mockImplementation(
      pending,
    );
    vi.mocked(vscodeHost.executeToolCall).mockResolvedValue({ ok: true });
  });

  function executeCommand(
    adaptor: VscodeRunningTaskAdaptor,
    agentType?: string,
    abortSignal = new AbortController().signal,
  ) {
    return adaptor.executeToolCall({
      taskId: "child",
      storeId,
      toolName: "executeCommand",
      toolCallId: "exec",
      input: { command: "agent-browser open" },
      abortSignal,
      toolPolicies: undefined,
      agentType,
    });
  }

  it("runs browser tools in the task's browser session and starts recording", async () => {
    vi.mocked(browserSessionManager.isRegistered).mockReturnValue(false);
    vi.mocked(vscodeHost.readBrowserAgentSettings).mockResolvedValue({
      browserSettings: serializeThreadSignalWithSnapshot(
        signal({
          runtime: { mode: "managed" },
          managedBrowser: { viewport: { width: 1280, height: 720 } },
        } as never),
      ),
    } as never);
    const adaptor = new VscodeRunningTaskAdaptor();

    await executeCommand(adaptor, "browser");

    expect(vi.mocked(vscodeHost.executeToolCall).mock.calls[0][2]).toMatchObject(
      { builtinSubAgentInfo: { type: "browser", sessionId: "child" } },
    );
    await vi.waitFor(() =>
      expect(browserSessionManager.registerSession).toHaveBeenCalledWith(
        "child",
        "parent",
        { viewport: { width: 1280, height: 720 } },
      ),
    );
    adaptor.dispose();
  });

  it("waits for browser settings and registration before executing the command", async () => {
    let finishSettings!: () => void;
    const readingSettings = new Promise<void>((resolve) => {
      finishSettings = resolve;
    });
    vi.mocked(vscodeHost.readBrowserAgentSettings).mockImplementation(
      async () => {
        await readingSettings;
        return {
          browserSettings: serializeThreadSignalWithSnapshot(
            signal({
              runtime: { mode: "managed" },
              managedBrowser: {},
            } as never),
          ),
        } as never;
      },
    );
    let finishRegistration!: () => void;
    const registering = new Promise<void>((resolve) => {
      finishRegistration = resolve;
    });
    vi.mocked(browserSessionManager.registerSession).mockReturnValue(
      registering,
    );
    const adaptor = new VscodeRunningTaskAdaptor();
    const execution = executeCommand(adaptor, "browser");

    try {
      expect(vscodeHost.executeToolCall).not.toHaveBeenCalled();
      finishSettings();
      await vi.waitFor(() =>
        expect(browserSessionManager.registerSession).toHaveBeenCalledOnce(),
      );
      expect(vscodeHost.executeToolCall).not.toHaveBeenCalled();
      finishRegistration();
      await execution;
      expect(vscodeHost.executeToolCall).toHaveBeenCalledOnce();
    } finally {
      finishSettings();
      finishRegistration();
      await execution;
      adaptor.dispose();
    }
  });

  it.each(["aborted", "disposed"] as const)(
    "does not register or execute when %s while reading browser settings",
    async (reason) => {
      let finishSettings!: () => void;
      const readingSettings = new Promise<void>((resolve) => {
        finishSettings = resolve;
      });
      vi.mocked(vscodeHost.readBrowserAgentSettings).mockImplementation(
        async () => {
          await readingSettings;
          return {
            browserSettings: serializeThreadSignalWithSnapshot(
              signal({
                runtime: { mode: "managed" },
                managedBrowser: {},
              } as never),
            ),
          } as never;
        },
      );
      const controller = new AbortController();
      const adaptor = new VscodeRunningTaskAdaptor();
      const execution = executeCommand(
        adaptor,
        "browser",
        controller.signal,
      ).catch((error) => error);

      try {
        expect(vscodeHost.readBrowserAgentSettings).toHaveBeenCalledOnce();
        if (reason === "aborted") controller.abort();
        else adaptor.dispose();
        finishSettings();

        const error = await execution;
        expect(vscodeHost.executeToolCall).not.toHaveBeenCalled();
        expect(browserSessionManager.registerSession).not.toHaveBeenCalled();
        expect(error).toBeInstanceOf(Error);
      } finally {
        finishSettings();
        await execution;
        adaptor.dispose();
      }
    },
  );

  it("leaves other agents' tools alone", async () => {
    const adaptor = new VscodeRunningTaskAdaptor();

    await executeCommand(adaptor, "explore");

    expect(
      vi.mocked(vscodeHost.executeToolCall).mock.calls[0][2]
        .builtinSubAgentInfo,
    ).toBeUndefined();
    expect(browserSessionManager.registerSession).not.toHaveBeenCalled();
    adaptor.dispose();
  });

  it("saves the recording under the parent's newTask call when the task finishes", async () => {
    const store = {
      query: vi
        .fn()
        .mockReturnValueOnce({ parentId: "parent" })
        .mockReturnValueOnce([
          {
            data: {
              parts: [
                {
                  type: "tool-newTask",
                  toolCallId: "new-task-call",
                  state: "output-available",
                  input: { agentType: "browser", _meta: { uid: "child" } },
                  output: { result: "", backgroundJobId: "bgjob-task-child" },
                },
              ],
            },
          },
        ]),
    };
    const adaptor = new VscodeRunningTaskAdaptor(store as never);

    await adaptor.onTaskFinished("child");

    expect(browserSessionManager.unregisterSession).toHaveBeenCalledWith(
      "child",
      "new-task-call",
      store,
    );
    adaptor.dispose();
  });
});
