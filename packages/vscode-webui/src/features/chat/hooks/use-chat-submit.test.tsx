import type {
  ActiveSelection,
  Review,
  TerminalTextSelection,
} from "@getpochi/common/vscode-webui-bridge";
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type DraftMessage, useChatSubmit } from "./use-chat-submit";

const chatStateMocks = vi.hoisted(() => ({
  autoApproveGuard: { current: "auto" },
  batchAbort: vi.fn(),
  isExecuting: false,
}));
const messageUtilsMocks = vi.hoisted(() => ({
  prepareMessageParts: vi.fn((_t, text: string) => [`text:${text}`]),
}));
const vscodeMocks = vi.hoisted(() => ({
  deleteReviews: vi.fn(),
  readTerminalSelection: vi.fn(async () => undefined as unknown),
  isVSCodeEnvironment: { value: false },
}));
const activeSelectionMock = vi.hoisted(() => ({
  value: undefined as ActiveSelection | undefined,
}));
const userEditsMocks = vi.hoisted(() => ({
  userEdits: [] as Array<{
    filepath: string;
    diff: string;
    added: number;
    removed: number;
  }>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/hooks/use-active-selection", () => ({
  useActiveSelection: () => activeSelectionMock.value,
}));

vi.mock("@/lib/message-utils", () => ({
  prepareMessageParts: messageUtilsMocks.prepareMessageParts,
}));

vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => vscodeMocks.isVSCodeEnvironment.value,
  vscodeHost: {
    deleteReviews: vscodeMocks.deleteReviews,
    readTerminalSelection: vscodeMocks.readTerminalSelection,
  },
}));

vi.mock("../lib/chat-state", () => ({
  useAutoApproveGuard: () => chatStateMocks.autoApproveGuard,
  useBatchExecuteManager: () => ({ abort: chatStateMocks.batchAbort }),
  useToolCallLifeCycle: () => ({ isExecuting: chatStateMocks.isExecuting }),
}));

describe("useChatSubmit", () => {
  beforeEach(() => {
    chatStateMocks.autoApproveGuard.current = "auto";
    chatStateMocks.batchAbort.mockReset();
    chatStateMocks.isExecuting = false;
    messageUtilsMocks.prepareMessageParts.mockClear();
    vscodeMocks.deleteReviews.mockReset();
    vscodeMocks.readTerminalSelection.mockReset();
    vscodeMocks.readTerminalSelection.mockResolvedValue(undefined);
    userEditsMocks.userEdits = [];
    vscodeMocks.isVSCodeEnvironment.value = false;
    activeSelectionMock.value = undefined;
  });

  describe("handleSubmit", () => {
    it("queues Enter submissions while the chat is busy without stopping", async () => {
      const context = setup({ isLoading: true });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(context.queuedMessages).toEqual([
        draftMessage({ text: "follow up" }),
      ]);
      expect(context.clearInput).toHaveBeenCalledOnce();
      expect(context.stopChat).not.toHaveBeenCalled();
      expect(context.sendMessage).not.toHaveBeenCalled();
      expect(chatStateMocks.autoApproveGuard.current).toBe("auto");
    });

    it("also queues while tool calls are executing", async () => {
      chatStateMocks.isExecuting = true;
      const context = setup({ isLoading: false });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(context.queuedMessages).toEqual([
        draftMessage({ text: "follow up" }),
      ]);
      expect(context.sendMessage).not.toHaveBeenCalled();
    });

    it("does nothing for an empty submission", async () => {
      const context = setup({ isLoading: false, inputText: "" });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(context.queuedMessages).toEqual([]);
      expect(context.clearInput).not.toHaveBeenCalled();
      expect(context.sendMessage).not.toHaveBeenCalled();
    });

    it("sends immediately when the chat is idle", async () => {
      const context = setup({ isLoading: false });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(context.clearInput).toHaveBeenCalledOnce();
      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: ["text:follow up"],
      });
      expect(chatStateMocks.autoApproveGuard.current).toBe("auto");
    });

    it("sends immediately when idle even if messages are already queued", async () => {
      const existing = draftMessage({ text: "already queued" });
      const context = setup({
        isLoading: false,
        queuedMessages: [existing],
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: ["text:follow up"],
      });
      // The pre-existing queue is left untouched by an immediate send.
      expect(context.queuedMessages).toEqual([existing]);
    });

    it("queues files and reviews while the chat is busy", async () => {
      const file = new File(["image"], "queued.png", { type: "image/png" });
      const review = createReview("review-1");
      const context = setup({
        isLoading: true,
        files: [file],
        reviews: [review],
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(context.queuedMessages).toEqual([
        draftMessage({ text: "follow up", filesCount: 1, reviewsCount: 1 }),
      ]);
      expect(context.upload).toHaveBeenCalledOnce();
      expect(context.clearInput).toHaveBeenCalledOnce();
      expect(context.clearFiles).toHaveBeenCalledOnce();
      expect(vscodeMocks.deleteReviews).toHaveBeenCalledWith(["review-1"]);
      expect(context.sendMessage).not.toHaveBeenCalled();
    });

    it("captures todo mode on queued submissions and resets it", async () => {
      const onTodoModeQueued = vi.fn();
      const context = setup({
        isLoading: true,
        isTodoMode: true,
        onTodoModeQueued,
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(context.queuedMessages).toEqual([
        draftMessage({ text: "follow up", isTodoMode: true }),
      ]);
      expect(onTodoModeQueued).toHaveBeenCalledOnce();
    });

    it("triggers onBeforeSendText when sending an immediate todo-mode message", async () => {
      const onBeforeSendText = vi.fn();
      const context = setup({
        isLoading: false,
        isTodoMode: true,
        onBeforeSendText,
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(onBeforeSendText).toHaveBeenCalledWith("follow up");
      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: ["text:follow up"],
      });
    });

    it("does not trigger onBeforeSendText when todo creation is disabled", async () => {
      const onBeforeSendText = vi.fn();
      const context = setup({
        isLoading: false,
        isTodoMode: true,
        canCreateTodo: false,
        onBeforeSendText,
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(onBeforeSendText).not.toHaveBeenCalled();
      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: ["text:follow up"],
      });
    });
  });

  describe("handleSteerSubmit", () => {
    it("stops the current stream and sends the message immediately", async () => {
      const context = setup({ isLoading: true });

      let promise: Promise<void>;
      await act(async () => {
        promise = context.result.current.handleSteerSubmit();
      });

      await act(async () => {
        context.rerender({ isLoading: false });
      });

      await act(async () => {
        await promise;
      });

      expect(context.clearInput).toHaveBeenCalledOnce();
      expect(context.stopChat).toHaveBeenCalledOnce();
      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: ["text:follow up"],
      });
      expect(context.queuedMessages).toEqual([]);
      expect(chatStateMocks.autoApproveGuard.current).toBe("auto");
    });

    it("aborts executing tool calls before sending", async () => {
      chatStateMocks.isExecuting = true;
      const context = setup({ isLoading: false });

      let promise: Promise<void>;
      await act(async () => {
        promise = context.result.current.handleSteerSubmit();
      });

      await act(async () => {
        chatStateMocks.isExecuting = false;
        context.rerender({ isLoading: false });
      });

      await act(async () => {
        await promise;
      });

      expect(chatStateMocks.batchAbort).toHaveBeenCalledOnce();
      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: ["text:follow up"],
      });
    });

    it("sends immediately without stopping when the chat is already idle", async () => {
      const context = setup({ isLoading: false });

      await act(async () => {
        await context.result.current.handleSteerSubmit();
      });

      expect(context.stopChat).not.toHaveBeenCalled();
      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: ["text:follow up"],
      });
    });

    it("does not interrupt or send when there is nothing to submit", async () => {
      const context = setup({ isLoading: true, inputText: "" });

      await act(async () => {
        await context.result.current.handleSteerSubmit();
      });

      expect(context.clearInput).not.toHaveBeenCalled();
      expect(context.stopChat).not.toHaveBeenCalled();
      expect(context.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe("handleSteerQueuedMessage", () => {
    it("stops the current stream, sends the selected queued message, and removes it from the queue", async () => {
      const first = draftMessage({ text: "first queued message" });
      const second = draftMessage({ text: "second queued message" });
      const context = setup({
        isLoading: true,
        queuedMessages: [first, second],
      });

      let promise: Promise<void>;
      await act(async () => {
        promise = context.result.current.handleSteerQueuedMessage(0);
      });

      await act(async () => {
        context.rerender({ isLoading: false });
      });

      await act(async () => {
        await promise;
      });

      expect(context.stopChat).toHaveBeenCalledOnce();
      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: ["text:first queued message"],
      });
      expect(context.queuedMessages).toEqual([second]);
    });

    it("does nothing when the index has no matching queued message", () => {
      const context = setup({ isLoading: true, queuedMessages: [] });

      act(() => {
        context.result.current.handleSteerQueuedMessage(0);
      });

      expect(context.stopChat).not.toHaveBeenCalled();
      expect(context.sendMessage).not.toHaveBeenCalled();
      expect(context.queuedMessages).toEqual([]);
    });
  });

  it("captures selection context when the message is created and reuses it when a queued message is later steered, instead of re-reading it at flush time", async () => {
    const queueTimeActiveSelection: ActiveSelection = {
      filepath: "/workspace/queued.ts",
      range: {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 5 },
      },
      content: "queue-time selection",
    };
    const queueTimeTerminalSelection: TerminalTextSelection = {
      terminalName: "queue-time terminal",
      content: "queue-time terminal text",
    };

    vscodeMocks.isVSCodeEnvironment.value = true;
    activeSelectionMock.value = queueTimeActiveSelection;
    vscodeMocks.readTerminalSelection.mockResolvedValue(
      queueTimeTerminalSelection,
    );

    const context = setup({ isLoading: true });

    // Queue the message while the chat is busy: this is where selection
    // context is captured.
    await act(async () => {
      await context.result.current.handleSubmit();
    });

    expect(vscodeMocks.readTerminalSelection).toHaveBeenCalledOnce();
    expect(context.queuedMessages).toEqual([
      draftMessage({
        text: "follow up",
        activeSelection: queueTimeActiveSelection,
        activeTerminalTextSelection: queueTimeTerminalSelection,
      }),
    ]);

    // Selection changes before the queued message is actually flushed.
    activeSelectionMock.value = {
      filepath: "/workspace/other.ts",
      range: {
        start: { line: 9, character: 0 },
        end: { line: 9, character: 3 },
      },
      content: "send-time selection",
    };
    vscodeMocks.readTerminalSelection.mockResolvedValue({
      terminalName: "send-time terminal",
      content: "send-time terminal text",
    });

    let steerPromise: Promise<void>;
    await act(async () => {
      steerPromise = context.result.current.handleSteerQueuedMessage(0);
    });

    await act(async () => {
      context.rerender({ isLoading: false });
    });

    await act(async () => {
      await steerPromise;
    });

    // The message was already fully prepared at queue time, so flushing it
    // must not re-read the selection context.
    expect(vscodeMocks.readTerminalSelection).toHaveBeenCalledOnce();
    expect(context.sendMessage).toHaveBeenCalledWith({
      parts: ["text:follow up"],
    });
  });

  it("still captures selection context at send time for a fresh, non-queued submission", async () => {
    const sendTimeActiveSelection: ActiveSelection = {
      filepath: "/workspace/fresh.ts",
      range: {
        start: { line: 2, character: 0 },
        end: { line: 2, character: 4 },
      },
      content: "fresh selection",
    };
    const sendTimeTerminalSelection: TerminalTextSelection = {
      terminalName: "fresh terminal",
      content: "fresh terminal text",
    };

    vscodeMocks.isVSCodeEnvironment.value = true;
    activeSelectionMock.value = sendTimeActiveSelection;
    vscodeMocks.readTerminalSelection.mockResolvedValue(
      sendTimeTerminalSelection,
    );

    const context = setup({ isLoading: false });

    await act(async () => {
      await context.result.current.handleSubmit();
    });

    expect(vscodeMocks.readTerminalSelection).toHaveBeenCalledOnce();
    expect(messageUtilsMocks.prepareMessageParts).toHaveBeenCalledWith(
      expect.any(Function),
      "follow up",
      [],
      [],
      [],
      sendTimeActiveSelection,
      sendTimeTerminalSelection,
    );
  });

  it("excludes user edits after they are removed from the input", async () => {
    userEditsMocks.userEdits = [
      {
        filepath: "src/example.ts",
        diff: "+const value = 1;",
        added: 1,
        removed: 0,
      },
    ];
    const context = setup({
      isLoading: false,
      includeUserEdits: false,
    });

    await act(async () => {
      await context.result.current.handleSubmit();
    });

    expect(messageUtilsMocks.prepareMessageParts).toHaveBeenCalledWith(
      expect.any(Function),
      "follow up",
      [],
      [],
      [],
      undefined,
      undefined,
    );
  });

  it("preserves excluded user edits when creating a queued message", async () => {
    userEditsMocks.userEdits = [
      {
        filepath: "src/example.ts",
        diff: "+const value = 1;",
        added: 1,
        removed: 0,
      },
    ];
    const context = setup({
      isLoading: true,
      includeUserEdits: false,
    });

    await act(async () => {
      await context.result.current.handleSubmit();
    });

    expect(messageUtilsMocks.prepareMessageParts).toHaveBeenCalledWith(
      expect.any(Function),
      "follow up",
      [],
      [],
      [],
      undefined,
      undefined,
    );

    expect(context.queuedMessages).toEqual([
      draftMessage({ text: "follow up", userEditsCount: 0 }),
    ]);
  });

  it("preserves included user edits when creating a queued message", async () => {
    const queuedUserEdits = [
      {
        filepath: "src/example.ts",
        diff: "+const value = 1;",
        added: 1,
        removed: 0,
      },
    ];
    userEditsMocks.userEdits = queuedUserEdits;
    const context = setup({
      isLoading: true,
      includeUserEdits: true,
    });

    await act(async () => {
      await context.result.current.handleSubmit();
    });

    expect(context.queuedMessages).toEqual([
      draftMessage({
        text: "follow up",
        userEditsCount: queuedUserEdits.length,
      }),
    ]);

    expect(messageUtilsMocks.prepareMessageParts).toHaveBeenCalledWith(
      expect.any(Function),
      "follow up",
      [],
      [],
      queuedUserEdits,
      undefined,
      undefined,
    );
  });
});

function setup({
  isLoading: initialIsLoading,
  inputText: initialInputText = " follow up ",
  queuedMessages: initialQueuedMessages = [],
  files = [],
  reviews = [],
  includeUserEdits: initialIncludeUserEdits = true,
  isTodoMode = false,
  canCreateTodo = true,
  onTodoModeQueued,
  onBeforeSendText,
}: {
  isLoading: boolean;
  inputText?: string;
  queuedMessages?: DraftMessage[];
  files?: File[];
  reviews?: Review[];
  includeUserEdits?: boolean;
  isTodoMode?: boolean;
  canCreateTodo?: boolean;
  onTodoModeQueued?: () => void;
  onBeforeSendText?: (text: string) => void;
}) {
  const sendMessage = vi.fn(() => Promise.resolve());
  const stopChat = vi.fn();
  const clearInput = vi.fn();
  const clearFiles = vi.fn();

  const upload = vi.fn(() => Promise.resolve([]));

  const hook = renderHook(
    (props: {
      isLoading: boolean;
      includeUserEdits: boolean;
      queuedMessages: DraftMessage[];
    }) => {
      const [queuedMessages, setQueuedMessages] = React.useState(
        props.queuedMessages,
      );

      // Keep the state in sync with props for manual rerenders if needed,
      // but also allow internal state updates to trigger rerenders.
      React.useEffect(() => {
        setQueuedMessages(props.queuedMessages);
      }, [props.queuedMessages]);

      // Mirrors the derivation performed by `useChatStatus` for a
      // model-valid, non-blocking scenario, so these tests can focus on
      // `useChatSubmit`'s own behavior without re-deriving all of the
      // underlying blocking/model-loading state.
      const isExecuting = chatStateMocks.isExecuting;
      const isRunning = props.isLoading || isExecuting;
      const isInputEmpty = !initialInputText.trim();
      const isFilesEmpty = files.length === 0;
      const isReviewsEmpty = reviews.length === 0;
      const isSubmitEnabled = !isInputEmpty || !isFilesEmpty || !isReviewsEmpty;
      const isStopEnabled = isRunning;
      const allowSendMessage = !isRunning;
      const allowSteer = true;

      const result = useChatSubmit({
        chat: {
          sendMessage,
          stop: stopChat,
        },
        input: { json: null, text: initialInputText },
        clearInput,
        attachmentUpload: {
          files,
          isUploading: false,
          upload,
          clearFiles,
          clearError: vi.fn(),
        } as never,
        isLoading: props.isLoading,
        isRunning,
        isSubmitEnabled,
        isStopEnabled,
        allowSendMessage,
        allowSteer,
        pendingApproval: undefined,
        queuedMessages,
        setQueuedMessages,
        reviews,
        userEdits: props.includeUserEdits ? userEditsMocks.userEdits : [],
        taskId: "task-1",
        isTodoMode,
        canCreateTodo,
        onTodoModeQueued,
        onBeforeSendText,
      });

      return { ...result, queuedMessages };
    },
    {
      initialProps: {
        isLoading: initialIsLoading,
        includeUserEdits: initialIncludeUserEdits,
        queuedMessages: initialQueuedMessages,
      },
    },
  );

  return {
    result: hook.result,
    rerender: (
      props: Partial<{
        isLoading: boolean;
        includeUserEdits: boolean;
        queuedMessages: DraftMessage[];
      }>,
    ) =>
      hook.rerender({
        isLoading: props.isLoading ?? initialIsLoading,
        includeUserEdits: props.includeUserEdits ?? initialIncludeUserEdits,
        queuedMessages: props.queuedMessages ?? initialQueuedMessages,
      }),
    get queuedMessages() {
      return hook.result.current.queuedMessages;
    },
    clearInput,
    clearFiles,
    upload,
    sendMessage,
    stopChat,
  };
}

function draftMessage({
  text,
  filesCount = 0,
  reviewsCount = 0,
  userEditsCount = 0,
  isTodoMode = false,
  activeSelection,
  activeTerminalTextSelection,
}: {
  text: string;
  filesCount?: number;
  reviewsCount?: number;
  userEditsCount?: number;
  isTodoMode?: boolean;
  activeSelection?: ActiveSelection;
  activeTerminalTextSelection?: TerminalTextSelection;
}): DraftMessage {
  return {
    parts: [`text:${text}`] as unknown as DraftMessage["parts"],
    raw: {
      text,
      filesCount,
      reviewsCount,
      userEditsCount,
      isTodoMode,
      activeSelection,
      activeTerminalTextSelection,
    },
  };
}

function createReview(id: string): Review {
  return {
    id,
    uri: "file:///workspace/file.ts",
    comments: [{ id: `${id}-comment`, body: "Please check this." }],
    codeSnippet: {
      content: "const value = 1;",
      startLine: 1,
      endLine: 1,
    },
  };
}
