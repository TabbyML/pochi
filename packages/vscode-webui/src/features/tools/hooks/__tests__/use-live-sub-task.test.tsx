import { ReadyForRetryError } from "@/features/retry";
import type { Todo } from "@getpochi/tools";
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
// Shared by useLiveChatKit().chat (live status) and useChat() (render status).
const chatMock = vi.hoisted<{ status: string }>(() => ({ status: "ready" }));
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
    status: chatMock.status,
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
    chat: chatMock,
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
    retryImplMock.mockReset();
    // Mirror the AI SDK: sending a request moves the chat out of "ready".
    retryImplMock.mockImplementation(() => {
      chatMock.status = "submitted";
    });
    chatMock.status = "ready";
    streamingResultMock.current = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("reads the environment in the subtask's own cwd", () => {
    storeMock.useQuery.mockReturnValueOnce({
      id: "subtask-1",
      parentId: "parent-1",
      status: "pending-model",
      cwd: "/repo.worktree/subagent-1",
    } as never);
    renderHook(() =>
      useLiveSubTask(
        { tool: makeTool("planner"), isExecuting: false },
        makeToolCallStatusRegistry(),
      ),
    );

    expect(useLiveChatKitGettersMock).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repo.worktree/subagent-1" }),
    );
  });

  it("starts only after the lifecycle has prepared the subtask", () => {
    const { rerender } = renderHook(() =>
      useLiveSubTask(
        { tool: makeTool("planner"), isExecuting: true },
        makeToolCallStatusRegistry(),
      ),
    );
    expect(retryImplMock).not.toHaveBeenCalled();

    streamingResultMock.current = {
      toolName: "newTask",
      abortSignal: new AbortController().signal,
      throws: vi.fn(),
    };
    rerender();
    expect(retryImplMock).toHaveBeenCalledOnce();
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

  it("sends the first request once when task preparation takes longer than the retry debounce", async () => {
    vi.useFakeTimers();
    // A fresh subtask only has the user prompt, which reads as ready-for-retry.
    retryErrorMock.current = new ReadyForRetryError();

    const { rerender } = renderHook(() =>
      useLiveSubTask(
        { tool: makeTool("planner"), isExecuting: true },
        makeToolCallStatusRegistry(),
      ),
    );

    // The lifecycle is still creating the isolated worktree.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(retryImplMock).not.toHaveBeenCalled();

    streamingResultMock.current = {
      toolName: "newTask",
      abortSignal: new AbortController().signal,
      throws: vi.fn(),
    };
    await act(async () => {
      rerender();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(retryImplMock).toHaveBeenCalledOnce();
  });

  it("cancels a pending retry once the first request has started", async () => {
    vi.useFakeTimers();
    retryErrorMock.current = new ReadyForRetryError();
    streamingResultMock.current = {
      toolName: "newTask",
      abortSignal: new AbortController().signal,
      throws: vi.fn(),
    };

    const { rerender } = renderHook(() =>
      useLiveSubTask(
        { tool: makeTool("planner"), isExecuting: true },
        makeToolCallStatusRegistry(),
      ),
    );
    expect(retryImplMock).toHaveBeenCalledOnce();

    // The request is in flight.
    await act(async () => {
      rerender();
    });

    // The first response finishes within the debounce window and its tool
    // calls are now executing: the chat is ready but must not be retried.
    chatMock.status = "ready";
    retryErrorMock.current = undefined;
    await act(async () => {
      rerender();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(retryImplMock).toHaveBeenCalledOnce();
  });
});
