// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatSubmit } from "./use-chat-submit";

const chatStateMocks = vi.hoisted(() => ({
  autoApproveGuard: { current: "auto" },
  batchAbort: vi.fn(),
  isExecuting: false,
}));
const messageUtilsMocks = vi.hoisted(() => ({
  prepareMessageParts: vi.fn((_t, text: string) => [`text:${text}`]),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/hooks/use-active-selection", () => ({
  useActiveSelection: () => undefined,
}));

vi.mock("@/lib/hooks/use-user-edits", () => ({
  useUserEdits: () => [],
}));

vi.mock("@/lib/message-utils", () => ({
  prepareMessageParts: messageUtilsMocks.prepareMessageParts,
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
  });

  it("queues Enter submissions while the chat is busy without stopping", async () => {
    const context = setup({ isLoading: true });

    await act(async () => {
      await context.hook.result.current.handleSubmit();
    });

    expect(context.queuedMessages).toEqual(["follow up"]);
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

    expect(context.queuedMessages).toEqual(["follow up"]);
    expect(context.clearInput).toHaveBeenCalledOnce();
    expect(context.stopChat).toHaveBeenCalledOnce();
    expect(context.sendMessage).not.toHaveBeenCalled();
    expect(chatStateMocks.autoApproveGuard.current).toBe("stop");
  });

  it("keeps adding Enter submissions when queued messages already exist", async () => {
    const context = setup({
      isLoading: false,
      queuedMessages: ["first queued message"],
    });

    await act(async () => {
      await context.hook.result.current.handleSubmit();
    });

    expect(context.queuedMessages).toEqual([
      "first queued message",
      "follow up",
    ]);
    expect(context.clearInput).toHaveBeenCalledOnce();
    expect(context.sendMessage).not.toHaveBeenCalled();
  });

  it("flushes only queued messages for the ready effect", async () => {
    const context = setup({
      isLoading: false,
      queuedMessages: ["first queued message", "second queued message"],
    });

    await act(async () => {
      await context.hook.result.current.handleSubmit(undefined, {
        flushQueuedMessages: true,
      });
    });

    expect(context.queuedMessages).toEqual(["second queued message"]);
    expect(context.clearInput).not.toHaveBeenCalled();
    expect(context.sendMessage).toHaveBeenCalledWith({
      parts: ["text:first queued message"],
    });
  });
});

function setup({
  isLoading,
  inputText: initialInputText = " follow up ",
  queuedMessages: initialQueuedMessages = [],
}: {
  isLoading: boolean;
  inputText?: string;
  queuedMessages?: string[];
}) {
  let queuedMessages = initialQueuedMessages;
  const setQueuedMessages = vi.fn((value: React.SetStateAction<string[]>) => {
    queuedMessages =
      typeof value === "function" ? value(queuedMessages) : value;
  }) as React.Dispatch<React.SetStateAction<string[]>>;
  const sendMessage = vi.fn(() => Promise.resolve());
  const stopChat = vi.fn();
  const clearInput = vi.fn();

  const hook = renderHook(() =>
    useChatSubmit({
      chat: {
        sendMessage,
        stop: stopChat,
      },
      input: { json: null, text: initialInputText },
      clearInput,
      attachmentUpload: {
        files: [],
        isUploading: false,
        upload: vi.fn(),
        clearFiles: vi.fn(),
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
      reviews: [],
      taskId: "task-1",
    }),
  );

  return {
    hook,
    get queuedMessages() {
      return queuedMessages;
    },
    clearInput,
    sendMessage,
    stopChat,
  };
}
