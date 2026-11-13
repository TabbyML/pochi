// @vitest-environment jsdom
import type { PendingApproval } from "@/features/approval";
import { type PastedTextFile, formatters } from "@getpochi/common";
import type {
  ActiveSelection,
  Review,
  TerminalTextSelection,
  ValidCustomAgentFile,
  ValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import type { Message, QueuedUserInput, Task } from "@getpochi/livekit";
import { act, renderHook } from "@testing-library/react";
import type { JSONContent } from "@tiptap/react";
import type { FileUIPart } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatInput } from "./use-chat-input-state";
import { useChatStatus } from "./use-chat-status";
import {
  type DraftMessage,
  type PendingInputController,
  useChatSubmit,
} from "./use-chat-submit";
import { getTodoModeObjective, toDraftMessage } from "./use-pending-input-sink";

const chatStateMocks = vi.hoisted(() => ({
  autoApproveGuard: { current: "auto" },
  batchAbort: vi.fn(),
  isExecuting: false,
}));
const autoApproveMocks = vi.hoisted(() => ({
  active: false,
  settings: { read: false, write: false, execute: false, mcp: false },
}));

vi.mock("@/features/settings", async () => {
  const { useToolAutoApproval } = await import(
    "../../settings/hooks/use-tool-auto-approval"
  );
  return { useToolAutoApproval };
});

vi.mock("../../settings/hooks/use-auto-approve", () => ({
  useAutoApprove: ({ autoApproveGuard }: { autoApproveGuard?: boolean }) => ({
    autoApproveActive: autoApproveMocks.active && (autoApproveGuard ?? true),
    autoApproveSettings: autoApproveMocks.settings,
  }),
}));

vi.mock("@/lib/hooks/use-mcp", () => ({
  useMcp: () => ({ toolset: {} }),
}));
const messageUtilsMocks = vi.hoisted(() => ({
  prepareMessageParts: vi.fn(
    (
      _t,
      text: string,
      _files,
      _reviews,
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
  useToolCallLifeCycle: () => ({
    isExecuting: chatStateMocks.isExecuting,
    completeToolCalls: [],
  }),
}));

describe("useChatSubmit", () => {
  beforeEach(() => {
    chatStateMocks.autoApproveGuard.current = "auto";
    chatStateMocks.batchAbort.mockReset();
    chatStateMocks.isExecuting = false;
    autoApproveMocks.active = false;
    autoApproveMocks.settings = {
      read: false,
      write: false,
      execute: false,
      mcp: false,
    };
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
    activeSelectionMock.value = undefined;
  });

  describe.each(["handleSubmit", "handleSteerSubmit", "handleSteer"] as const)(
    "%s while waiting for tool approval",
    (method) => {
      it.each([
        { name: "manual approval", autoApproveActive: false, batch: false },
        {
          name: "disabled tool category",
          autoApproveActive: true,
          batch: false,
        },
        { name: "batch approval", autoApproveActive: false, batch: true },
      ])(
        "cancels pending tools and sends immediately with $name",
        async ({ autoApproveActive, batch }) => {
          autoApproveMocks.active = autoApproveActive;
          autoApproveMocks.settings.read = true;
          const tool = {
            type: "tool-executeCommand",
            toolCallId: "command-1",
            state: "input-available",
            input: { command: "echo pending" },
          } as const;
          const tools = batch
            ? [tool, { ...tool, toolCallId: "command-2" }]
            : [tool];
          const pendingApproval: PendingApproval = batch
            ? { name: "batchCall", tools }
            : { name: "executeCommand", tool };
          const parts: Message["parts"] = [
            { type: "text", text: "do this instead" },
          ];
          if (method !== "handleSteer") {
            messageUtilsMocks.prepareMessageParts.mockReturnValueOnce(
              parts as never,
            );
          }
          const queued = { parts, raw: { text: "do this instead" } };
          const remaining = draftMessage({ text: "another queued message" });
          const context = setup({
            isLoading: false,
            pendingApproval,
            taskStatus: "pending-tool",
            queuedMessages: method === "handleSteer" ? [queued, remaining] : [],
          });

          expect(context.result.current.isRunning).toBe(false);
          expect(context.result.current.allowSendMessage).toBe(true);

          await act(async () => {
            void context.result.current[method]();
          });

          // Steering sends every queued message at once.
          expect(context.sendMessage).toHaveBeenCalledExactlyOnceWith({
            parts:
              method === "handleSteer" ? [...parts, ...remaining.parts] : parts,
          });
          expect(context.queuedMessages).toEqual([]);
          expect(context.stopChat).not.toHaveBeenCalled();
          expect(chatStateMocks.batchAbort).not.toHaveBeenCalled();

          // Both the model request and UI resolve the old calls when the new
          // user message follows them, without a separate tool-result turn.
          const messages: Message[] = [
            { id: "assistant-1", role: "assistant", parts: tools },
            { id: "user-2", role: "user", parts },
          ];
          for (const format of [formatters.llm, formatters.ui]) {
            expect(format(messages)[0].parts).toEqual(
              tools.map((pendingTool) => ({
                ...pendingTool,
                state: "output-available",
                output: { error: "User cancelled the tool call." },
              })),
            );
          }
        },
      );
    },
  );

  it("keeps Enter submissions queued when the pending tool is auto-approved", async () => {
    autoApproveMocks.active = true;
    autoApproveMocks.settings.execute = true;
    const context = setup({
      isLoading: false,
      taskStatus: "pending-tool",
      pendingApproval: {
        name: "executeCommand",
        tool: {
          type: "tool-executeCommand",
          toolCallId: "command-1",
          state: "input-available",
          input: { command: "echo pending" },
        },
      },
    });

    await act(async () => {
      await context.result.current.handleSubmit();
    });

    expect(context.queuedMessages).toEqual([
      draftMessage({ text: "follow up" }),
    ]);
    expect(context.sendMessage).not.toHaveBeenCalled();
    expect(context.stopChat).not.toHaveBeenCalled();
  });

  describe.each(["handleSubmit", "handleSteerSubmit"] as const)(
    "%s preparation state",
    (method) => {
      it.each(["upload", "persistence"])(
        "handles a tool approved during %s before sending",
        async (stage) => {
          const context = setup({
            isLoading: false,
            taskStatus: "pending-tool",
            pendingApproval: {
              name: "executeCommand",
              tool: {
                type: "tool-executeCommand",
                toolCallId: "command-1",
                state: "input-available",
                input: { command: "echo pending" },
              },
            },
            files:
              stage === "upload"
                ? [new File(["image"], "image.png", { type: "image/png" })]
                : [],
            pastedTexts: stage === "persistence" ? ["pasted text"] : [],
          });
          let finishPreparation!: () => void;
          const preparation = new Promise<[]>((resolve) => {
            finishPreparation = () => resolve([]);
          });
          if (stage === "upload") {
            context.upload.mockReturnValueOnce(preparation);
          } else {
            vscodeMocks.persistPastedTextFiles.mockReturnValueOnce(preparation);
          }

          expect(context.result.current.allowSendMessage).toBe(true);
          let submission!: Promise<void>;
          await act(async () => {
            submission = context.result.current[method]();
          });
          expect(context.result.current.isPreparingMessage).toBe(true);

          // Approval remains available while the message is being prepared.
          chatStateMocks.isExecuting = true;
          context.rerender({});
          expect(context.result.current.allowSendMessage).toBe(false);

          await act(async () => {
            finishPreparation();
          });
          expect(context.sendMessage).not.toHaveBeenCalled();
          expect(context.stopChat).not.toHaveBeenCalled();

          if (method === "handleSubmit") {
            await submission;
            expect(context.queuedMessages).toHaveLength(1);
            expect(chatStateMocks.batchAbort).not.toHaveBeenCalled();
          } else {
            expect(chatStateMocks.batchAbort).toHaveBeenCalledExactlyOnceWith(
              "task-1",
              "user-abort",
            );
            // Queued until the interrupted agent is ready for it.
            expect(context.queuedMessages).toHaveLength(1);

            // Steering must wait for the executing lifecycle to settle.
            chatStateMocks.isExecuting = false;
            context.rerender({});
            await act(async () => {
              await submission;
            });
            expect(context.sendMessage).toHaveBeenCalledOnce();
            expect(context.queuedMessages).toEqual([]);
          }
        },
      );

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
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(messageUtilsMocks.prepareMessageParts).toHaveBeenCalledWith(
        expect.any(Function),
        "/changing",
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
      expect(context.todoObjectives).toEqual(["/changing"]);
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

    it("sends the queue first when idle with messages already queued", async () => {
      chatStateMocks.autoApproveGuard.current = "stop";
      const existing = draftMessage({ text: "already queued" });
      const context = setup({
        isLoading: false,
        queuedMessages: [existing],
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(context.sendMessage).toHaveBeenCalledExactlyOnceWith({
        parts: ["text:already queued", "text:follow up"],
      });
      expect(context.queuedMessages).toEqual([]);
      expect(chatStateMocks.autoApproveGuard.current).toBe("auto");
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

    it("sends an immediate todo-mode message with its todo objective", async () => {
      const context = setup({
        isLoading: false,
        isTodoMode: true,
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(context.todoObjectives).toEqual(["follow up"]);
      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: ["text:follow up"],
      });
    });

    it("includes pasted text in the todo objective when the editor is empty", async () => {
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
      });

      await act(async () => {
        await context.result.current.handleSubmit();
      });

      expect(context.todoObjectives).toEqual([
        "Referenced pasted text files:\n- pasted text file: /tmp/pasted-0.txt. Read this file before continuing.",
      ]);
      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: [
          {
            type: "data-pasted-text",
            data: { filePath: "/tmp/pasted-0.txt", title: pastedText },
          },
        ],
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
          draftMessage({ text: "follow up" }),
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
      // Once ready, steering sends everything queued meanwhile as well.
      expect(context.sendMessage).toHaveBeenCalledExactlyOnceWith({
        parts: ["text:follow up", "text:new queued message"],
      });
    });

    it("consumes Todo mode before waiting and does not clear it again afterwards", async () => {
      const onTodoModeSubmitted = vi.fn();
      const context = setup({
        isLoading: true,
        isTodoMode: true,
        onTodoModeSubmitted,
      });
      let steering!: Promise<void>;
      await act(async () => {
        steering = context.result.current.handleSteerSubmit();
      });

      try {
        expect(onTodoModeSubmitted).toHaveBeenCalledOnce();
        expect(context.result.current.isPreparingMessage).toBe(false);
        expect(context.todoObjectives).toEqual([]);
      } finally {
        await act(async () => context.rerender({ isLoading: false }));
        await act(async () => {
          await steering;
        });
      }
      expect(onTodoModeSubmitted).toHaveBeenCalledOnce();
      expect(context.clearInput).toHaveBeenCalledOnce();
      expect(context.todoObjectives).toEqual(["follow up"]);
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

  describe("handleSteer", () => {
    it("stops the current stream and sends every queued message as one message", async () => {
      const first = draftMessage({ text: "first queued message" });
      const second = draftMessage({ text: "second queued message" });
      const context = setup({
        isLoading: true,
        queuedMessages: [first, second],
      });

      let promise: Promise<void>;
      await act(async () => {
        promise = context.result.current.handleSteer();
      });

      expect(context.sendMessage).not.toHaveBeenCalled();
      expect(chatStateMocks.autoApproveGuard.current).toBe("stop");

      await act(async () => {
        context.rerender({ isLoading: false });
      });

      await act(async () => {
        await promise;
      });

      expect(context.stopChat).toHaveBeenCalledOnce();
      expect(context.sendMessage).toHaveBeenCalledExactlyOnceWith({
        parts: ["text:first queued message", "text:second queued message"],
      });
      expect(context.queuedMessages).toEqual([]);
      // Explicit steering resumes the agent after handleStop paused it.
      expect(chatStateMocks.autoApproveGuard.current).toBe("auto");
    });

    it("sends right away without stopping when the chat is already idle", async () => {
      const first = draftMessage({ text: "first", isTodoMode: true });
      const second = draftMessage({ text: "second" });
      const context = setup({
        isLoading: false,
        queuedMessages: [first, second],
      });

      await act(async () => {
        await context.result.current.handleSteer();
      });

      expect(context.stopChat).not.toHaveBeenCalled();
      expect(context.sendMessage).toHaveBeenCalledExactlyOnceWith({
        parts: ["text:first", "text:second"],
      });
      expect(context.todoObjectives).toEqual(["first"]);
      expect(context.queuedMessages).toEqual([]);
    });

    it("delivers pending notifications after interrupting the agent", async () => {
      const context = setup({ isLoading: true, pendingNotifications: 1 });

      let promise: Promise<void>;
      await act(async () => {
        promise = context.result.current.handleSteer();
      });

      expect(context.flushPendingInput).not.toHaveBeenCalled();

      await act(async () => {
        context.rerender({ isLoading: false });
      });

      await act(async () => {
        await promise;
      });

      expect(context.stopChat).toHaveBeenCalledOnce();
      expect(context.flushPendingInput).toHaveBeenCalledExactlyOnceWith({
        automatic: false,
      });
      expect(context.pendingNotifications).toBe(0);
      expect(chatStateMocks.autoApproveGuard.current).toBe("auto");
    });
  });

  describe("sendPendingInput", () => {
    it("leaves the approval guard alone for notifications delivered on their own", async () => {
      chatStateMocks.autoApproveGuard.current = "manual";
      const context = setup({ isLoading: false, pendingNotifications: 1 });

      let sent = false;
      await act(async () => {
        sent = context.result.current.sendPendingInput({ automatic: true });
      });

      expect(sent).toBe(true);
      expect(chatStateMocks.autoApproveGuard.current).toBe("manual");
    });

    it("resumes the agent when user input goes out with them", async () => {
      chatStateMocks.autoApproveGuard.current = "stop";
      const context = setup({
        isLoading: false,
        pendingNotifications: 1,
        queuedMessages: [draftMessage({ text: "queued" })],
      });

      await act(async () => {
        context.result.current.sendPendingInput({ automatic: true });
      });

      expect(context.sendMessage).toHaveBeenCalledWith({
        parts: ["text:queued"],
      });
      expect(chatStateMocks.autoApproveGuard.current).toBe("auto");
    });

    it("changes nothing when the chat kit does not send", async () => {
      chatStateMocks.autoApproveGuard.current = "stop";
      const context = setup({ isLoading: false });

      let sent = true;
      await act(async () => {
        sent = context.result.current.sendPendingInput();
      });

      expect(sent).toBe(false);
      expect(chatStateMocks.autoApproveGuard.current).toBe("stop");
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
      steerPromise = context.result.current.handleSteer();
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
      sendTimeActiveSelection,
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
  pendingNotifications: initialPendingNotifications = 0,
  files = [],
  uploadedAttachments = [],
  reviews = [],
  skills = [],
  customAgents = [],
  terminalContextSelections = [],
  isTodoMode = false,
  onTodoModeSubmitted,
  pendingApproval,
  taskStatus,
}: {
  isLoading: boolean;
  inputText?: string;
  inputJson?: JSONContent | null;
  pastedTexts?: string[];
  queuedMessages?: DraftMessage[];
  /** Background job notifications the fake chat kit holds. */
  pendingNotifications?: number;
  files?: File[];
  uploadedAttachments?: FileUIPart[];
  reviews?: Review[];
  skills?: ValidSkillFile[];
  customAgents?: ValidCustomAgentFile[];
  terminalContextSelections?: TerminalTextSelection[];
  isTodoMode?: boolean;
  onTodoModeSubmitted?: () => void;
  pendingApproval?: PendingApproval;
  taskStatus?: Task["status"];
}) {
  const sendMessage = vi.fn((_message: { parts: Message["parts"] }) =>
    Promise.resolve(),
  );
  const stopChat = vi.fn();
  const clearInput = vi.fn();
  const clearFiles = vi.fn();
  const clearTerminalContextSelections = vi.fn();

  const upload = vi.fn(() => Promise.resolve(uploadedAttachments));

  // A fake chat kit that owns the pending input like the real one: it sends
  // everything pending as one message unless a request is in flight.
  let nextId = 0;
  let userInputs: QueuedUserInput[] = initialQueuedMessages.map((message) => ({
    id: `queued-${nextId++}`,
    parts: message.parts,
    display: { raw: message.raw, draft: message.draft },
  }));
  let pendingNotifications = initialPendingNotifications;
  const takenUserInputs: QueuedUserInput[][] = [];
  let busy = initialIsLoading;
  const flushPendingInput = vi.fn(
    (_options?: { automatic?: boolean }): boolean => {
      if (busy || (userInputs.length === 0 && pendingNotifications === 0)) {
        return false;
      }
      const parts = userInputs.flatMap((input) => input.parts);
      takenUserInputs.push(userInputs);
      userInputs = [];
      pendingNotifications = 0;
      void sendMessage({ parts });
      return true;
    },
  );
  const pendingInputController: PendingInputController = {
    get pendingInput() {
      return { userInputs, notifications: [] };
    },
    queueUserInput: (input) => {
      const id = `queued-${nextId++}`;
      userInputs = [...userInputs, { ...input, id }];
      return id;
    },
    removeUserInput: (id) => {
      const input = userInputs.find((item) => item.id === id);
      userInputs = userInputs.filter((item) => item.id !== id);
      return input;
    },
    flushPendingInput,
  };

  const hook = renderHook(
    (props: { isLoading: boolean }) => {
      busy = props.isLoading;
      const {
        isRunning,
        isSubmitEnabled,
        isStopEnabled,
        allowSendMessage,
        allowSteer,
      } = useChatStatus({
        isModelValid: true,
        isLoading: props.isLoading,
        isInputEmpty: !initialInputText.trim() && pastedTexts.length === 0,
        isFilesEmpty: files.length === 0,
        isReviewsEmpty: reviews.length === 0,
        isTerminalContextEmpty: terminalContextSelections.length === 0,
        isUploadingAttachments: false,
        blockingState: {
          isBusy: false,
          busyLabel: undefined,
          activeOperation: undefined,
        },
        taskStatus,
        pendingApproval,
        isSubTask: false,
      });

      const result = useChatSubmit({
        chat: { stop: stopChat },
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
        pendingApproval,
        pendingInputController,
        reviews,
        skills,
        customAgents,
        terminalContextSelections,
        clearTerminalContextSelections,
        taskId: "task-1",
        isTodoMode,
        onTodoModeSubmitted,
      });

      return { ...result, isRunning, allowSendMessage };
    },
    {
      initialProps: { isLoading: initialIsLoading },
    },
  );

  return {
    result: hook.result,
    rerender: (
      props: Partial<{
        isLoading: boolean;
      }>,
    ) =>
      hook.rerender({
        isLoading: props.isLoading ?? initialIsLoading,
      }),
    get queuedMessages() {
      return userInputs.map(toDraftMessage);
    },
    get pendingNotifications() {
      return pendingNotifications;
    },
    /** The todo objective the page would create from each sent batch. */
    get todoObjectives() {
      return takenUserInputs.map(getTodoModeObjective);
    },
    clearInput,
    clearFiles,
    clearTerminalContextSelections,
    upload,
    sendMessage,
    stopChat,
    flushPendingInput,
  };
}

function draftMessage({
  text,
  // `setup` submits the untrimmed editor text by default.
  inputText = ` ${text} `,
  attachments = [],
  filesCount = 0,
  reviewsCount = 0,
  terminalContextCount = 0,
  isTodoMode = false,
  activeSelection,
}: {
  text: string;
  inputText?: string;
  attachments?: FileUIPart[];
  filesCount?: number;
  reviewsCount?: number;
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
