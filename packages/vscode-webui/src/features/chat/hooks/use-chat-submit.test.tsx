import type { Review } from "@getpochi/common/vscode-webui-bridge";
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type QueuedMessage, useChatSubmit } from "./use-chat-submit";

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
  readTerminalSelection: vi.fn(async () => undefined),
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
  useActiveSelection: () => undefined,
}));

vi.mock("@/lib/hooks/use-user-edits", () => ({
  useUserEdits: () => userEditsMocks.userEdits,
}));

vi.mock("@/lib/message-utils", () => ({
  prepareMessageParts: messageUtilsMocks.prepareMessageParts,
}));

vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => false,
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
  });

  it("queues Enter submissions while the chat is busy without stopping", async () => {
    const context = setup({ isLoading: true });

    await act(async () => {
      await context.hook.result.current.handleSubmit();
    });

    expect(context.queuedMessages).toEqual([
      queuedMessage({ text: "follow up" }),
    ]);
    expect(context.clearInput).toHaveBeenCalledOnce();
    expect(context.stopChat).not.toHaveBeenCalled();
    expect(chatStateMocks.batchAbort).not.toHaveBeenCalled();
    expect(context.sendMessage).not.toHaveBeenCalled();
    expect(chatStateMocks.autoApproveGuard.current).toBe("auto");
  });

  it("queues Command+Enter submissions and stops the current stream", async () => {
    const context = setup({ isLoading: true });

    await act(async () => {
      await context.hook.result.current.handleSteerSubmit();
    });

    expect(context.queuedMessages).toEqual([
      queuedMessage({ text: "follow up" }),
    ]);
    expect(context.clearInput).toHaveBeenCalledOnce();
    expect(context.stopChat).toHaveBeenCalledOnce();
    expect(context.sendMessage).not.toHaveBeenCalled();
    expect(chatStateMocks.autoApproveGuard.current).toBe("stop");
  });

  it("does not interrupt Command+Enter when there is no current or queued message", async () => {
    const context = setup({ isLoading: true, inputText: "" });

    await act(async () => {
      await context.hook.result.current.handleSteerSubmit();
    });

    expect(context.queuedMessages).toEqual([]);
    expect(context.clearInput).not.toHaveBeenCalled();
    expect(context.stopChat).not.toHaveBeenCalled();
    expect(context.sendMessage).not.toHaveBeenCalled();
    expect(chatStateMocks.autoApproveGuard.current).toBe("auto");
  });

  it("keeps the visible queue stable when Command+Enter interrupts with queued messages", async () => {
    const firstQueuedMessage = queuedMessage({ text: "first queued message" });
    const context = setup({
      isLoading: true,
      queuedMessages: [firstQueuedMessage],
    });

    await act(async () => {
      await context.hook.result.current.handleSteerSubmit();
    });

    expect(context.queuedMessages).toEqual([firstQueuedMessage]);
    expect(context.clearInput).toHaveBeenCalledOnce();
    expect(context.stopChat).toHaveBeenCalledOnce();
    expect(context.sendMessage).not.toHaveBeenCalled();
    expect(chatStateMocks.autoApproveGuard.current).toBe("stop");

    context.setIsLoading(false);
    await act(async () => {
      await context.hook.result.current.handleSubmit(undefined, {
        flushQueuedMessages: true,
      });
    });

    expect(context.queuedMessages).toEqual([firstQueuedMessage]);
    expect(context.sendMessage).toHaveBeenNthCalledWith(1, {
      parts: ["text:follow up"],
    });

    await act(async () => {
      await context.hook.result.current.handleSubmit(undefined, {
        flushQueuedMessages: true,
      });
    });

    expect(context.queuedMessages).toEqual([]);
    expect(context.sendMessage).toHaveBeenNthCalledWith(2, {
      parts: ["text:first queued message"],
    });
  });

  it("stores Command+Enter submissions as hidden pending messages while idle with queued messages", async () => {
    const firstQueuedMessage = queuedMessage({ text: "first queued message" });
    const context = setup({
      isLoading: false,
      queuedMessages: [firstQueuedMessage],
    });

    await act(async () => {
      await context.hook.result.current.handleSteerSubmit();
    });

    expect(context.queuedMessages).toEqual([firstQueuedMessage]);
    expect(context.clearInput).toHaveBeenCalledOnce();
    expect(context.stopChat).not.toHaveBeenCalled();
    expect(context.sendMessage).not.toHaveBeenCalled();

    await act(async () => {
      await context.hook.result.current.handleSubmit(undefined, {
        flushQueuedMessages: true,
      });
    });

    expect(context.queuedMessages).toEqual([firstQueuedMessage]);
    expect(context.sendMessage).toHaveBeenCalledWith({
      parts: ["text:follow up"],
    });
  });

  it("keeps adding Enter submissions when queued messages already exist", async () => {
    const context = setup({
      isLoading: false,
      queuedMessages: [queuedMessage({ text: "first queued message" })],
    });

    await act(async () => {
      await context.hook.result.current.handleSubmit();
    });

    expect(context.queuedMessages).toEqual([
      queuedMessage({ text: "first queued message" }),
      queuedMessage({ text: "follow up" }),
    ]);
    expect(context.clearInput).toHaveBeenCalledOnce();
    expect(context.sendMessage).not.toHaveBeenCalled();
  });

  it("flushes only queued messages for the ready effect", async () => {
    const context = setup({
      isLoading: false,
      queuedMessages: [
        queuedMessage({ text: "first queued message" }),
        queuedMessage({ text: "second queued message" }),
      ],
    });

    await act(async () => {
      await context.hook.result.current.handleSubmit(undefined, {
        flushQueuedMessages: true,
      });
    });

    expect(context.queuedMessages).toEqual([
      queuedMessage({ text: "second queued message" }),
    ]);
    expect(context.clearInput).not.toHaveBeenCalled();
    expect(context.sendMessage).toHaveBeenCalledWith({
      parts: ["text:first queued message"],
    });
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
      await context.hook.result.current.handleSubmit();
    });

    expect(context.queuedMessages).toEqual([
      queuedMessage({ text: "follow up", files: [file], reviews: [review] }),
    ]);
    expect(context.clearInput).toHaveBeenCalledOnce();
    expect(context.clearFiles).toHaveBeenCalledOnce();
    expect(vscodeMocks.deleteReviews).toHaveBeenCalledWith(["review-1"]);
    expect(context.sendMessage).not.toHaveBeenCalled();
  });

  it("captures todo mode on queued submissions", async () => {
    const context = setup({ isLoading: true, isTodoMode: true });

    await act(async () => {
      await context.hook.result.current.handleSubmit();
    });

    expect(context.queuedMessages).toEqual([
      queuedMessage({ text: "follow up", isTodoMode: true }),
    ]);
  });

  it("resets todo mode after queueing a todo submission", async () => {
    const onTodoModeQueued = vi.fn();
    const context = setup({
      isLoading: true,
      isTodoMode: true,
      onTodoModeQueued,
    });

    await act(async () => {
      await context.hook.result.current.handleSubmit();
    });

    expect(onTodoModeQueued).toHaveBeenCalledOnce();
  });

  it("uses queued todo mode when flushing queued messages", async () => {
    const onBeforeSendText = vi.fn();
    const context = setup({
      isLoading: false,
      isTodoMode: true,
      onBeforeSendText,
      queuedMessages: [
        queuedMessage({ text: "regular queued message", isTodoMode: false }),
        queuedMessage({ text: "todo queued message", isTodoMode: true }),
      ],
    });

    await act(async () => {
      await context.hook.result.current.handleSubmit(undefined, {
        flushQueuedMessages: true,
      });
    });
    expect(onBeforeSendText).not.toHaveBeenCalled();

    context.hook.rerender();

    await act(async () => {
      await context.hook.result.current.handleSubmit(undefined, {
        flushQueuedMessages: true,
      });
    });
    expect(onBeforeSendText).toHaveBeenCalledWith("todo queued message");
  });

  it("does not apply queued todo mode when todo creation is disabled", async () => {
    const onBeforeSendText = vi.fn();
    const context = setup({
      isLoading: false,
      canCreateTodo: false,
      onBeforeSendText,
      queuedMessages: [
        queuedMessage({ text: "todo queued message", isTodoMode: true }),
      ],
    });

    await act(async () => {
      await context.hook.result.current.handleSubmit(undefined, {
        flushQueuedMessages: true,
      });
    });

    expect(onBeforeSendText).not.toHaveBeenCalled();
    expect(context.sendMessage).toHaveBeenCalledWith({
      parts: ["text:todo queued message"],
    });
  });

  it("flushes queued files and reviews from the queued item", async () => {
    const file = new File(["image"], "queued.png", { type: "image/png" });
    const review = createReview("review-1");
    const uploadedFile = {
      type: "file" as const,
      filename: "queued.png",
      mediaType: "image/png",
      url: "blob:queued",
    };
    const context = setup({
      isLoading: false,
      queuedMessages: [
        queuedMessage({ text: "check this", files: [file], reviews: [review] }),
      ],
      uploadFiles: vi.fn(() => Promise.resolve([uploadedFile])),
    });

    await act(async () => {
      await context.hook.result.current.handleSubmit(undefined, {
        flushQueuedMessages: true,
      });
    });

    expect(context.uploadFiles).toHaveBeenCalledWith([file]);
    expect(messageUtilsMocks.prepareMessageParts).toHaveBeenCalledWith(
      expect.any(Function),
      "check this",
      [uploadedFile],
      [review],
      [],
      undefined,
      undefined,
    );
    expect(context.clearFiles).not.toHaveBeenCalled();
    expect(context.sendMessage).toHaveBeenCalledWith({
      parts: ["text:check this"],
    });
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
      await context.hook.result.current.handleSubmit();
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

  it("preserves excluded user edits when flushing a queued message", async () => {
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
      await context.hook.result.current.handleSubmit();
    });

    expect(context.queuedMessages).toEqual([
      queuedMessage({ text: "follow up", userEdits: [] }),
    ]);

    context.setIsLoading(false);
    context.setIncludeUserEdits(true);
    await act(async () => {
      await context.hook.result.current.handleSubmit(undefined, {
        flushQueuedMessages: true,
      });
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

  it("preserves included user edits when flushing a queued message", async () => {
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
      await context.hook.result.current.handleSubmit();
    });

    expect(context.queuedMessages).toEqual([
      queuedMessage({ text: "follow up", userEdits: queuedUserEdits }),
    ]);

    userEditsMocks.userEdits = [
      {
        filepath: "src/other.ts",
        diff: "+const value = 2;",
        added: 1,
        removed: 0,
      },
    ];
    context.setIsLoading(false);
    context.setIncludeUserEdits(false);
    await act(async () => {
      await context.hook.result.current.handleSubmit(undefined, {
        flushQueuedMessages: true,
      });
    });

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
  includeUserEdits = true,
  isTodoMode = false,
  canCreateTodo = true,
  onTodoModeQueued,
  onBeforeSendText,
  uploadFiles = vi.fn(() => Promise.resolve([])),
}: {
  isLoading: boolean;
  inputText?: string;
  queuedMessages?: QueuedMessage[];
  files?: File[];
  reviews?: Review[];
  includeUserEdits?: boolean;
  isTodoMode?: boolean;
  canCreateTodo?: boolean;
  onTodoModeQueued?: () => void;
  onBeforeSendText?: (text: string) => void;
  uploadFiles?: ReturnType<typeof vi.fn>;
}) {
  let queuedMessages = initialQueuedMessages;
  let isLoading = initialIsLoading;
  let shouldIncludeUserEdits = includeUserEdits;
  const setQueuedMessages = vi.fn(
    (value: React.SetStateAction<QueuedMessage[]>) => {
      queuedMessages =
        typeof value === "function" ? value(queuedMessages) : value;
    },
  ) as React.Dispatch<React.SetStateAction<QueuedMessage[]>>;
  const sendMessage = vi.fn(() => Promise.resolve());
  const stopChat = vi.fn();
  const clearInput = vi.fn();
  const clearFiles = vi.fn();

  const upload = vi.fn(() => Promise.resolve([]));

  const hook = renderHook(() =>
    useChatSubmit({
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
        uploadFiles,
        clearFiles,
        clearError: vi.fn(),
      } as never,
      isSubmitDisabled: false,
      isLoading,
      blockingState: {
        isBusy: false,
        busyLabel: undefined,
        activeOperation: undefined,
      },
      pendingApproval: undefined,
      queuedMessages,
      setQueuedMessages,
      reviews,
      taskId: "task-1",
      includeUserEdits: shouldIncludeUserEdits,
      isTodoMode,
      canCreateTodo,
      onTodoModeQueued,
      onBeforeSendText,
    }),
  );

  return {
    hook,
    get queuedMessages() {
      return queuedMessages;
    },
    clearInput,
    clearFiles,
    uploadFiles,
    sendMessage,
    stopChat,
    setIsLoading(value: boolean) {
      isLoading = value;
      hook.rerender();
    },
    setIncludeUserEdits(value: boolean) {
      shouldIncludeUserEdits = value;
      hook.rerender();
    },
  };
}

function queuedMessage({
  text,
  files = [],
  reviews = [],
  userEdits = [],
  isTodoMode = false,
}: {
  text: string;
  files?: File[];
  reviews?: Review[];
  userEdits?: QueuedMessage["userEdits"];
  isTodoMode?: boolean;
}): QueuedMessage {
  return {
    text,
    files,
    reviews,
    userEdits,
    isTodoMode,
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
