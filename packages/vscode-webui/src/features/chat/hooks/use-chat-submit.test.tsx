// @vitest-environment jsdom
import type { PastedTextFile } from "@getpochi/common";
import type {
  ActiveSelection,
  Review,
  TerminalTextSelection,
  ValidCustomAgentFile,
  ValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import { act, renderHook } from "@testing-library/react";
import type { JSONContent } from "@tiptap/react";
import type { FileUIPart } from "ai";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatInput } from "./use-chat-input-state";
import { type DraftMessage, useChatSubmit } from "./use-chat-submit";

const chatStateMocks = vi.hoisted(() => ({
  autoApproveGuard: { current: "auto" },
  batchAbort: vi.fn(),
  isExecuting: false,
}));
const messageUtilsMocks = vi.hoisted(() => ({
  prepareMessageParts: vi.fn(
    (
      _t,
      text: string,
      _files,
      _reviews,
      _userEdits,
      _activeSelection,
      _terminalContextSelections,
      invokedSkills: ValidSkillFile[] = [],
      invokedCustomAgents: string[] = [],
      pastedTextFiles: PastedTextFile[] = [],
    ) => [
      ...invokedSkills.map((skill) => `skill:${skill.instructions}`),
      ...invokedCustomAgents.map((agentName) => `agent:${agentName}`),
      `text:${text}`,
      ...pastedTextFiles.map((file) => `pasted:${file.filePath}`),
    ],
  ),
}));
const vscodeMocks = vi.hoisted(() => ({
  deleteReviews: vi.fn(),
  persistPastedTextFiles: vi.fn(async (_taskId: string, texts: string[]) =>
    texts.map((text, index) => ({
      filePath: `/tmp/pasted-${index}.txt`,
      title: text,
    })),
  ),
  showWarningMessage: vi.fn(async () => undefined),
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

vi.mock("@/lib/message-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/message-utils")>()),
  prepareMessageParts: messageUtilsMocks.prepareMessageParts,
}));

vi.mock("@/lib/vscode", () => ({
  vscodeHost: {
    deleteReviews: vscodeMocks.deleteReviews,
    persistPastedTextFiles: vscodeMocks.persistPastedTextFiles,
    showWarningMessage: vscodeMocks.showWarningMessage,
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
    vscodeMocks.persistPastedTextFiles.mockReset();
    vscodeMocks.persistPastedTextFiles.mockImplementation(
      async (_taskId: string, texts: string[]) =>
        texts.map((text, index) => ({
          filePath: `/tmp/pasted-${index}.txt`,
          title: text,
        })),
    );
    vscodeMocks.showWarningMessage.mockClear();
    userEditsMocks.userEdits = [];
    activeSelectionMock.value = undefined;
  });

  describe.each(["handleSubmit", "handleSteerSubmit"] as const)(
    "%s preparation state",
    (method) => {
      it("stays busy through upload and text persistence, but not the response", async () => {
        const context = setup({
          isLoading: false,
          files: [new File(["image"], "image.png", { type: "image/png" })],
          pastedTexts: ["pasted text"],
        });
        let finishUpload!: (parts: FileUIPart[]) => void;
        let finishPersistence!: (files: PastedTextFile[]) => void;
        let finishResponse!: () => void;
        context.upload.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishUpload = resolve;
            }),
        );
        vscodeMocks.persistPastedTextFiles.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishPersistence = resolve;
            }),
        );
        context.sendMessage.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finishResponse = resolve;
            }),
        );

        let submission!: Promise<void>;
        await act(async () => {
          submission = context.result.current[method]();
        });
        expect(context.result.current.isPreparingMessage).toBe(true);

        await act(async () => {
          finishUpload([]);
        });
        expect(vscodeMocks.persistPastedTextFiles).toHaveBeenCalledOnce();
        expect(context.result.current.isPreparingMessage).toBe(true);

        await act(async () => {
          finishPersistence([]);
          await submission;
        });
        expect(context.sendMessage).toHaveBeenCalledOnce();
        expect(context.result.current.isPreparingMessage).toBe(false);
        finishResponse();
      });

      it.each(["upload", "persistence"])(
        "unlocks when %s fails",
        async (stage) => {
          const context = setup({
            isLoading: true,
            files: [new File(["image"], "image.png", { type: "image/png" })],
            pastedTexts: ["pasted text"],
          });
          let fail!: (error: Error) => void;
          if (stage === "upload") {
            context.upload.mockImplementationOnce(
              () =>
                new Promise((_, reject) => {
                  fail = reject;
                }),
            );
          } else {
            vscodeMocks.persistPastedTextFiles.mockImplementationOnce(
              () =>
                new Promise((_, reject) => {
                  fail = reject;
                }),
            );
          }
          let submission!: Promise<void>;
          await act(async () => {
            submission = context.result.current[method]();
          });
          expect(context.result.current.isPreparingMessage).toBe(true);

          await act(async () => {
            fail(new Error("preparation failed"));
            await submission;
          });
          expect(context.result.current.isPreparingMessage).toBe(false);
          expect(context.clearInput).not.toHaveBeenCalled();
          expect(context.queuedMessages).toEqual([]);
        },
      );
    },
  );

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

    it("sends pasted text when the editor is empty", async () => {
      const context = setup({
        isLoading: false,
        inputText: "",
        pastedTexts: ["large pasted text"],
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: ["text:", "pasted:/tmp/pasted-0.txt"],
      });
      expect(vscodeMocks.persistPastedTextFiles).toHaveBeenCalledWith(
        "task-1",
        ["large pasted text"],
      );
      expect(context.clearInput).toHaveBeenCalledOnce();
    });

    it("keeps the draft when pasted text persistence fails", async () => {
      vscodeMocks.persistPastedTextFiles.mockRejectedValueOnce(
        new Error("disk full"),
      );
      const context = setup({
        isLoading: false,
        inputText: "",
        pastedTexts: ["large pasted text"],
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(context.clearInput).not.toHaveBeenCalled();
      expect(context.sendMessage).not.toHaveBeenCalled();
    });

    it("sends a non-user-invocable skill typed as plain text", async () => {
      const context = setup({
        isLoading: false,
        inputText: "/hidden do the task",
        inputJson: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "/hidden do the task" }],
            },
          ],
        },
        skills: [createSkill("hidden", { userInvocable: false })],
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(vscodeMocks.showWarningMessage).not.toHaveBeenCalled();
      expect(context.sendMessage).toHaveBeenCalledOnce();
    });

    it("sends a user-invocable skill typed as plain text", async () => {
      const context = setup({
        isLoading: false,
        inputText: "/deploy do the task",
        inputJson: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "/deploy do the task" }],
            },
          ],
        },
        skills: [createSkill("deploy")],
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(vscodeMocks.showWarningMessage).not.toHaveBeenCalled();
      expect(context.sendMessage).toHaveBeenCalledOnce();
    });

    it("sends unknown slash text as plain text", async () => {
      const context = setup({
        isLoading: false,
        inputText: "/unknown do the task",
        inputJson: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "/unknown do the task" }],
            },
          ],
        },
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(vscodeMocks.showWarningMessage).not.toHaveBeenCalled();
      expect(context.sendMessage).toHaveBeenCalledOnce();
    });

    it("uses the synchronous editor snapshot instead of stale input state", async () => {
      const context = setup({
        isLoading: false,
        inputText: "/find-skills",
      });
      const submittedInput = {
        json: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "/find-skills 这个干啥的" }],
            },
          ],
        },
        text: "/find-skills 这个干啥的",
      } satisfies ChatInput;

      await act(async () => {
        await context.result.current.handleSubmit(undefined, submittedInput);
      });

      expect(messageUtilsMocks.prepareMessageParts).toHaveBeenCalledWith(
        expect.any(Function),
        "/find-skills 这个干啥的",
        [],
        [],
        [],
        undefined,
        [],
        [],
        [],
        [],
      );
    });

    it("re-resolves a skill mention against the current skill", async () => {
      const selectedSkill = createSkill("changing", {
        instructions: "old instructions",
      });
      const currentSkill = createSkill("changing", {
        instructions: "current instructions",
      });
      const onBeforeSendText = vi.fn();
      const context = setup({
        isLoading: false,
        inputText: "/changing",
        inputJson: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "slashMention",
                  attrs: {
                    type: "skill",
                    id: "changing",
                    rawData: selectedSkill,
                  },
                },
              ],
            },
          ],
        },
        skills: [currentSkill],
        isTodoMode: true,
        onBeforeSendText,
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(messageUtilsMocks.prepareMessageParts).toHaveBeenCalledWith(
        expect.any(Function),
        "/changing",
        [],
        [],
        [],
        undefined,
        [],
        [currentSkill],
        [],
        [],
      );
      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: ["skill:current instructions", "text:/changing"],
      });
      expect(onBeforeSendText).toHaveBeenCalledWith("/changing");
    });

    it("adds a reminder for a selected custom agent mention", async () => {
      const customAgent = createCustomAgent("tester");
      const prompt =
        'use <custom-agent id="tester" path="/agents/tester.md">/tester</custom-agent> for this task';
      const context = setup({
        isLoading: false,
        inputText: prompt,
        inputJson: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "use " },
                {
                  type: "slashMention",
                  attrs: {
                    type: "custom-agent",
                    id: "tester",
                    rawData: customAgent,
                  },
                },
                { type: "text", text: " for this task" },
              ],
            },
          ],
        },
        customAgents: [customAgent],
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(messageUtilsMocks.prepareMessageParts).toHaveBeenCalledWith(
        expect.any(Function),
        prompt,
        [],
        [],
        [],
        undefined,
        [],
        [],
        ["tester"],
        [],
      );
      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: ["agent:tester", `text:${prompt}`],
      });
    });

    it("rejects a skill mention that is no longer available", async () => {
      const context = setup({
        isLoading: false,
        inputText: "stale expanded skill instructions",
        inputJson: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "slashMention",
                  attrs: { type: "skill", id: "removed" },
                },
              ],
            },
          ],
        },
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(vscodeMocks.showWarningMessage).toHaveBeenCalledWith(
        'Skill "removed" is no longer available. Remove or reselect the slash command.',
        { modal: false },
      );
      expect(context.sendMessage).not.toHaveBeenCalled();
      expect(context.clearInput).not.toHaveBeenCalled();
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
      const uploadedPart: FileUIPart = {
        type: "file",
        filename: "queued.png",
        mediaType: "image/png",
        url: "https://blob/queued.png",
      };
      const review = createReview("review-1");
      const context = setup({
        isLoading: true,
        files: [file],
        uploadedAttachments: [uploadedPart],
        reviews: [review],
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(context.queuedMessages).toEqual([
        draftMessage({
          text: "follow up",
          filesCount: 1,
          reviewsCount: 1,
          attachments: [uploadedPart],
        }),
      ]);
      expect(context.upload).toHaveBeenCalledOnce();
      expect(context.clearInput).toHaveBeenCalledOnce();
      expect(context.clearFiles).toHaveBeenCalledOnce();
      expect(vscodeMocks.deleteReviews).toHaveBeenCalledWith(["review-1"]);
      expect(context.sendMessage).not.toHaveBeenCalled();
    });

    it("captures the composer snapshot so a queued message can be edited", async () => {
      const inputJson: JSONContent = {
        type: "doc",
        content: [{ type: "paragraph" }],
      };
      const context = setup({
        isLoading: true,
        inputText: "queued text",
        inputJson,
        pastedTexts: ["pasted"],
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(context.queuedMessages[0]?.draft).toEqual({
        input: {
          json: inputJson,
          text: "queued text",
          pastedTexts: ["pasted"],
        },
        attachments: [],
      });
    });

    it("captures todo mode on queued submissions and resets it", async () => {
      const onTodoModeSubmitted = vi.fn();
      const context = setup({
        isLoading: true,
        isTodoMode: true,
        onTodoModeSubmitted,
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(context.queuedMessages).toEqual([
        draftMessage({ text: "follow up", isTodoMode: true }),
      ]);
      expect(onTodoModeSubmitted).toHaveBeenCalledOnce();
      expect(context.result.current.isPreparingMessage).toBe(false);
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

    it("includes pasted text in the todo objective when the editor is empty", async () => {
      const onBeforeSendText = vi.fn();
      const pastedText = "large pasted text";
      messageUtilsMocks.prepareMessageParts.mockReturnValueOnce([
        {
          type: "data-pasted-text",
          data: { filePath: "/tmp/pasted-0.txt", title: pastedText },
        },
      ] as never);
      const context = setup({
        isLoading: false,
        inputText: "",
        pastedTexts: [pastedText],
        isTodoMode: true,
        onBeforeSendText,
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(onBeforeSendText).toHaveBeenCalledWith(
        "Referenced pasted text files:\n- pasted text file: /tmp/pasted-0.txt. Read this file before continuing.",
      );
      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: [
          {
            type: "data-pasted-text",
            data: { filePath: "/tmp/pasted-0.txt", title: pastedText },
          },
        ],
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
    it("allows another message to queue while readiness never arrives", async () => {
      const context = setup({ isLoading: true });
      let steering!: Promise<void>;
      await act(async () => {
        steering = context.result.current.handleSteerSubmit();
      });

      try {
        await act(async () => {
          await context.result.current.handleSubmit(undefined, {
            json: null,
            text: "new queued message",
          });
        });

        expect(context.queuedMessages).toEqual([
          draftMessage({
            text: "new queued message",
            inputText: "new queued message",
          }),
        ]);
        expect(context.sendMessage).not.toHaveBeenCalled();
        expect(context.result.current.isPreparingMessage).toBe(false);
      } finally {
        // End the pending operation after checking behavior without readiness.
        await act(async () => context.rerender({ isLoading: false }));
        await act(async () => {
          await steering;
        });
      }
    });

    it("consumes Todo mode before waiting and does not clear it again afterwards", async () => {
      const onTodoModeSubmitted = vi.fn();
      const onBeforeSendText = vi.fn();
      const context = setup({
        isLoading: true,
        isTodoMode: true,
        onTodoModeSubmitted,
        onBeforeSendText,
      });
      let steering!: Promise<void>;
      await act(async () => {
        steering = context.result.current.handleSteerSubmit();
      });

      try {
        expect(onTodoModeSubmitted).toHaveBeenCalledOnce();
        expect(context.result.current.isPreparingMessage).toBe(false);
        expect(onBeforeSendText).not.toHaveBeenCalled();
      } finally {
        await act(async () => context.rerender({ isLoading: false }));
        await act(async () => {
          await steering;
        });
      }
      expect(onTodoModeSubmitted).toHaveBeenCalledOnce();
      expect(context.clearInput).toHaveBeenCalledOnce();
      expect(onBeforeSendText).toHaveBeenCalledWith("follow up");
    });

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

  describe("handleSteerBackgroundJobNotifications", () => {
    it("stops the current stream before the chat kit delivers them", async () => {
      const flushBackgroundJobNotifications = vi.fn(() => {
        expect(chatStateMocks.autoApproveGuard.current).toBe("auto");
        return true;
      });
      const context = setup({
        isLoading: true,
        flushBackgroundJobNotifications,
      });

      let promise: Promise<void>;
      await act(async () => {
        promise =
          context.result.current.handleSteerBackgroundJobNotifications();
      });

      expect(flushBackgroundJobNotifications).not.toHaveBeenCalled();
      expect(chatStateMocks.autoApproveGuard.current).toBe("stop");

      await act(async () => {
        context.rerender({ isLoading: false });
      });

      await act(async () => {
        await promise;
      });

      expect(context.stopChat).toHaveBeenCalledOnce();
      expect(flushBackgroundJobNotifications).toHaveBeenCalledOnce();
      // The kit owns the notifications, so nothing is sent from here.
      expect(context.sendMessage).not.toHaveBeenCalled();
    });

    it("delivers right away when the chat is already idle", async () => {
      chatStateMocks.autoApproveGuard.current = "stop";
      const flushBackgroundJobNotifications = vi.fn(() => {
        expect(chatStateMocks.autoApproveGuard.current).toBe("auto");
        return true;
      });
      const context = setup({
        isLoading: false,
        flushBackgroundJobNotifications,
      });

      await act(async () => {
        await context.result.current.handleSteerBackgroundJobNotifications();
      });

      expect(context.stopChat).not.toHaveBeenCalled();
      expect(flushBackgroundJobNotifications).toHaveBeenCalledOnce();
    });

    it("sends the submitted message as typed, notifications ride along", async () => {
      const context = setup({ isLoading: false });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      // The kit attaches its pending notifications while preparing the
      // request, so the message the user submitted is sent as typed.
      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: ["text:follow up"],
      });
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

    activeSelectionMock.value = queueTimeActiveSelection;

    const context = setup({ isLoading: true });

    // Queue the message while the chat is busy: this is where selection
    // context is captured.
    await act(async () => {
      await context.result.current.handleSubmit();
    });

    expect(context.queuedMessages).toEqual([
      draftMessage({
        text: "follow up",
        activeSelection: queueTimeActiveSelection,
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

    activeSelectionMock.value = sendTimeActiveSelection;

    const context = setup({ isLoading: false });

    await act(async () => {
      await context.result.current.handleSubmit();
    });

    expect(messageUtilsMocks.prepareMessageParts).toHaveBeenCalledWith(
      expect.any(Function),
      "follow up",
      [],
      [],
      [],
      sendTimeActiveSelection,
      [],
      [],
      [],
      [],
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
      [],
      [],
      [],
      [],
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
      [],
      [],
      [],
      [],
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
      [],
      [],
      [],
      [],
    );
  });

  it("allows submitting with no text when terminal context selections are attached", async () => {
    const terminalContextSelections: TerminalTextSelection[] = [
      { terminalName: "bash", content: "echo hi" },
    ];
    const context = setup({
      isLoading: false,
      inputText: "",
      terminalContextSelections,
    });

    await act(async () => {
      await context.result.current.handleSubmit();
    });

    expect(context.sendMessage).toHaveBeenCalledWith({
      parts: ["text:"],
    });
  });

  it("sends attached terminal context selections and clears them after sending", async () => {
    const terminalContextSelections: TerminalTextSelection[] = [
      { terminalName: "bash", content: "echo hi" },
    ];

    const context = setup({
      isLoading: false,
      terminalContextSelections,
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
      terminalContextSelections,
      [],
      [],
      [],
    );
    expect(context.clearTerminalContextSelections).toHaveBeenCalledOnce();
  });

  it("does not clear terminal context selections when none are attached", async () => {
    const context = setup({ isLoading: false });

    await act(async () => {
      await context.result.current.handleSubmit();
    });

    expect(context.clearTerminalContextSelections).not.toHaveBeenCalled();
  });
});

function setup({
  isLoading: initialIsLoading,
  inputText: initialInputText = " follow up ",
  inputJson = null,
  pastedTexts = [],
  queuedMessages: initialQueuedMessages = [],
  files = [],
  uploadedAttachments = [],
  reviews = [],
  skills = [],
  customAgents = [],
  includeUserEdits: initialIncludeUserEdits = true,
  terminalContextSelections = [],
  isTodoMode = false,
  canCreateTodo = true,
  onTodoModeSubmitted,
  onBeforeSendText,
  flushBackgroundJobNotifications,
}: {
  isLoading: boolean;
  inputText?: string;
  inputJson?: JSONContent | null;
  pastedTexts?: string[];
  queuedMessages?: DraftMessage[];
  files?: File[];
  uploadedAttachments?: FileUIPart[];
  reviews?: Review[];
  skills?: ValidSkillFile[];
  customAgents?: ValidCustomAgentFile[];
  includeUserEdits?: boolean;
  terminalContextSelections?: TerminalTextSelection[];
  isTodoMode?: boolean;
  canCreateTodo?: boolean;
  onTodoModeSubmitted?: () => void;
  onBeforeSendText?: (text: string) => void;
  flushBackgroundJobNotifications?: () => boolean;
}) {
  const sendMessage = vi.fn(() => Promise.resolve());
  const stopChat = vi.fn();
  const clearInput = vi.fn();
  const clearFiles = vi.fn();
  const clearTerminalContextSelections = vi.fn();

  const upload = vi.fn(() => Promise.resolve(uploadedAttachments));

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
      const isInputEmpty = !initialInputText.trim() && pastedTexts.length === 0;
      const isFilesEmpty = files.length === 0;
      const isReviewsEmpty = reviews.length === 0;
      const isTerminalContextEmpty = terminalContextSelections.length === 0;
      const isSubmitEnabled =
        !isInputEmpty ||
        !isFilesEmpty ||
        !isReviewsEmpty ||
        !isTerminalContextEmpty;
      const isStopEnabled = isRunning;
      const allowSendMessage = !isRunning;
      const allowSteer = true;

      const result = useChatSubmit({
        chat: {
          sendMessage,
          stop: stopChat,
        },
        input: { json: inputJson, text: initialInputText, pastedTexts },
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
        skills,
        customAgents,
        terminalContextSelections,
        clearTerminalContextSelections,
        taskId: "task-1",
        isTodoMode,
        canCreateTodo,
        onTodoModeSubmitted,
        onBeforeSendText,
        flushBackgroundJobNotifications,
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
    clearTerminalContextSelections,
    upload,
    sendMessage,
    stopChat,
  };
}

function draftMessage({
  text,
  // `setup` submits the untrimmed editor text by default.
  inputText = ` ${text} `,
  attachments = [],
  filesCount = 0,
  reviewsCount = 0,
  userEditsCount = 0,
  terminalContextCount = 0,
  isTodoMode = false,
  activeSelection,
}: {
  text: string;
  inputText?: string;
  attachments?: FileUIPart[];
  filesCount?: number;
  reviewsCount?: number;
  userEditsCount?: number;
  terminalContextCount?: number;
  isTodoMode?: boolean;
  activeSelection?: ActiveSelection;
}): DraftMessage {
  return {
    parts: [`text:${text}`] as unknown as DraftMessage["parts"],
    raw: {
      text,
      filesCount,
      reviewsCount,
      userEditsCount,
      terminalContextCount,
      isTodoMode,
      activeSelection,
    },
    draft: {
      input: { json: null, text: inputText, pastedTexts: [] },
      attachments,
    },
  };
}

function createSkill(
  name: string,
  overrides: Partial<ValidSkillFile> = {},
): ValidSkillFile {
  return {
    name,
    description: `${name} description`,
    filePath: `/skills/${name}/SKILL.md`,
    instructions: `${name} instructions`,
    ...overrides,
  };
}

function createCustomAgent(name: string): ValidCustomAgentFile {
  return {
    name,
    description: `${name} description`,
    filePath: `/agents/${name}.md`,
    systemPrompt: `${name} system prompt`,
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
