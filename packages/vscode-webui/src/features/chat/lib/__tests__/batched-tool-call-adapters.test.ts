import { blobStore } from "@/lib/remote-blob-store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSubtaskBatchedToolCall } from "../batched-tool-call-adapters";

const executeToolCall = vi.fn();
vi.mock("@/lib/vscode", () => ({
  vscodeHost: {
    executeToolCall: (...args: unknown[]) => executeToolCall(...args),
  },
}));

vi.mock("@/lib/remote-blob-store", () => ({
  blobStore: {
    protocol: "https:",
    put: vi.fn(),
    get: vi.fn(),
  },
}));

const processContentOutput = vi.fn();
vi.mock("@getpochi/livekit", () => ({
  processContentOutput: (...args: unknown[]) => processContentOutput(...args),
}));

vi.mock("@quilted/threads", () => ({
  ThreadAbortSignal: {
    serialize: vi.fn(() => ({})),
  },
}));

function makeToolCallStatusRegistry() {
  return { set: vi.fn() } as unknown as Parameters<
    typeof createSubtaskBatchedToolCall
  >[0]["toolCallStatusRegistry"];
}

describe("createSubtaskBatchedToolCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // By default, pass the raw result through unchanged.
    processContentOutput.mockImplementation(async (_blobStore, result) => result);
  });

  it("routes media readFile output through processContentOutput before adding tool output (regression)", async () => {
    // Regression: sub-agent readFile results with base64 media data must be
    // processed via processContentOutput into a blob url, otherwise the
    // downstream toModelOutput fails with "Failed to load media.".
    const rawResult = {
      type: "media",
      data: btoa("fake-image-bytes"),
      mimeType: "image/png",
    };
    const processedResult = {
      type: "media",
      data: "https://blob.example/generated-blob",
      mimeType: "image/png",
    };
    executeToolCall.mockResolvedValue(rawResult);
    processContentOutput.mockResolvedValue(processedResult);

    const addToolOutput = vi.fn();
    const abortSignal = new AbortController().signal;

    const batched = createSubtaskBatchedToolCall({
      toolCall: {
        toolName: "readFile",
        toolCallId: "tool-call-1",
        input: { path: "image.png" },
      } as never,
      uid: "subtask-1",
      storeId: "store-1",
      abortSignal,
      contentType: ["image/png"],
      addToolOutput,
      toolCallStatusRegistry: makeToolCallStatusRegistry(),
    });

    const result = await batched.run();

    expect(result).toEqual({ kind: "success" });
    expect(processContentOutput).toHaveBeenCalledWith(
      blobStore,
      rawResult,
      abortSignal,
    );
    expect(addToolOutput).toHaveBeenCalledWith({
      tool: "readFile",
      toolCallId: "tool-call-1",
      output: processedResult,
    });
  });

  it("still stores non-media results after processing", async () => {
    const textResult = { content: "hello world", isTruncated: false };
    executeToolCall.mockResolvedValue(textResult);

    const addToolOutput = vi.fn();

    const batched = createSubtaskBatchedToolCall({
      toolCall: {
        toolName: "readFile",
        toolCallId: "tool-call-2",
        input: { path: "notes.txt" },
      } as never,
      uid: "subtask-1",
      storeId: "store-1",
      abortSignal: new AbortController().signal,
      addToolOutput,
      toolCallStatusRegistry: makeToolCallStatusRegistry(),
    });

    const result = await batched.run();

    expect(result).toEqual({ kind: "success" });
    expect(processContentOutput).toHaveBeenCalledOnce();
    expect(addToolOutput).toHaveBeenCalledWith({
      tool: "readFile",
      toolCallId: "tool-call-2",
      output: textResult,
    });
  });
});
