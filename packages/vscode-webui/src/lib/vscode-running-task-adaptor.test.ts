// @vitest-environment node
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
      parentTaskId: "parent",
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
