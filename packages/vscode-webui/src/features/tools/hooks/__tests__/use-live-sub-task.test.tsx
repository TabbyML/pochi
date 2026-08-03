import { ReadyForRetryError } from "@/features/retry";
import type { Todo } from "@getpochi/tools";
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveSubTask } from "../use-live-sub-task";

const useLiveChatKitGettersMock = vi.hoisted(() => vi.fn(() => ({})));
const storeMock = vi.hoisted(() => ({
  storeId: "store-1",
  useQuery: vi.fn(() => ({
    id: "subtask-1",
    parentId: "parent-1",
    status: "pending-model",
  })),
}));
const retryErrorMock = vi.hoisted<{ current: Error | undefined }>(() => ({
  current: undefined,
}));
const retryImplMock = vi.hoisted(() => vi.fn());
const streamingResultMock = vi.hoisted<{
  current:
    | {
        toolName: string;
        abortSignal: AbortSignal;
        throws: ReturnType<typeof vi.fn>;
      }
    | undefined;
}>(() => ({ current: undefined }));

vi.mock("@/features/chat", () => ({
  useBatchExecuteManager: () => ({
    abort: vi.fn(),
    enqueue: vi.fn(),
    processQueue: vi.fn(),
  }),
  useLiveChatKitGetters: useLiveChatKitGettersMock,
  useToolCallLifeCycle: () => ({
    getToolCallLifeCycle: () => ({
      streamingResult: streamingResultMock.current,
    }),
  }),
}));

vi.mock("@/features/retry", () => ({
  ReadyForRetryError: class ReadyForRetryError extends Error {
    constructor(public kind = "ready") {
      super();
    }
  },
  isRetryableError: (error: Error & { kind?: string }) =>
    error.kind !== "content-filter",
  useMixinReadyForRetryError: () => retryErrorMock.current,
  useRetry: () => retryImplMock,
}));

vi.mock("@/lib/hooks/use-custom-agents", () => ({
  useCustomAgent: () => ({
    customAgent: undefined,
    customAgentModel: undefined,
    isLoading: false,
  }),
}));

vi.mock("@/lib/remote-blob-store", () => ({
  blobStore: {},
}));

vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => storeMock,
}));

vi.mock("@/lib/vscode", () => ({
  vscodeHost: {
    clearFileStateCache: vi.fn(),
  },
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    addToolOutput: vi.fn(),
    error: undefined,
    messages: [],
    regenerate: vi.fn(),
    sendMessage: vi.fn(),
    setMessages: vi.fn(),
    status: "ready",
  }),
}));

vi.mock("@getpochi/livekit", () => ({
  catalog: {
    queries: {
      makeTaskQuery: vi.fn((taskId: string) => ({ taskId })),
    },
  },
}));

vi.mock("@getpochi/livekit/react", () => ({
  useLiveChatKit: () => ({
    chat: {},
  }),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    getStaticToolName: () => "newTask",
    lastAssistantMessageIsCompleteWithToolCalls: () => false,
  };
});

const auditTodo: Todo = {
  id: "todo-1",
  content: "Add one test",
  status: "in-progress",
  priority: "medium",
};

function makeTool(agentType: string) {
  return {
    toolCallId: "tool-call-1",
    state: "input-available",
    input: {
      agentType,
      _meta: {
        uid: "subtask-1",
        todos: [auditTodo],
      },
    },
  } as never;
}

function makeToolCallStatusRegistry() {
  return {
    entries: vi.fn(() => []),
    on: vi.fn(() => vi.fn()),
  } as never;
}

describe("useLiveSubTask", () => {
  beforeEach(() => {
    useLiveChatKitGettersMock.mockClear();
    storeMock.useQuery.mockClear();
    retryErrorMock.current = undefined;
    retryImplMock.mockClear();
    streamingResultMock.current = undefined;
  });

  it("passes audit todos to attemptTodoCompletion subtasks", () => {
    renderHook(() =>
      useLiveSubTask(
        { tool: makeTool("attemptTodoCompletion"), isExecuting: false },
        makeToolCallStatusRegistry(),
      ),
    );

    expect(useLiveChatKitGettersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        todos: expect.objectContaining({
          current: [auditTodo],
        }),
      }),
    );
  });

  it("does not pass audit todos to other subtasks", () => {
    renderHook(() =>
      useLiveSubTask(
        { tool: makeTool("planner"), isExecuting: false },
        makeToolCallStatusRegistry(),
      ),
    );

    expect(useLiveChatKitGettersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        todos: expect.objectContaining({
          current: undefined,
        }),
      }),
    );
  });

  it("does not automatically retry a content-filtered subtask", async () => {
    vi.useFakeTimers();
    retryErrorMock.current = new ReadyForRetryError("content-filter");
    streamingResultMock.current = {
      toolName: "newTask",
      abortSignal: new AbortController().signal,
      throws: vi.fn(),
    };

    renderHook(() =>
      useLiveSubTask(
        { tool: makeTool("planner"), isExecuting: true },
        makeToolCallStatusRegistry(),
      ),
    );

    retryImplMock.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(retryImplMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
