import type { Todo } from "@getpochi/tools";
// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
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

vi.mock("@/features/chat", () => ({
  useBatchExecuteManager: () => ({
    abort: vi.fn(),
    enqueue: vi.fn(),
    processQueue: vi.fn(),
  }),
  useLiveChatKitGetters: useLiveChatKitGettersMock,
  useToolCallLifeCycle: () => ({
    getToolCallLifeCycle: () => ({
      streamingResult: undefined,
    }),
  }),
}));

vi.mock("@/features/retry", () => ({
  ReadyForRetryError: class ReadyForRetryError extends Error {},
  useMixinReadyForRetryError: () => undefined,
  useRetry: () => vi.fn(),
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
});
