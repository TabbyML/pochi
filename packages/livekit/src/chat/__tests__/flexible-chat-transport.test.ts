import {
  type Environment,
  parseEnvironmentInfo,
  prompts,
} from "@getpochi/common";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import type { BlobStore } from "../../blob-store";
import type { LiveKitStore, Message } from "../../types";
import {
  FlexibleChatTransport,
  type OnStartCallback,
  convertDataPartToText,
  extractContentFilterMetadata,
  getNumCompacts,
} from "../flexible-chat-transport";
import { compactTask } from "../llm/compact-task";

type MessagePart = Message["parts"][number];

describe("environment after compaction", () => {
  it.each(["llm", "task-memory"])(
    "restores and reports the user environment on a %s compacted tool continuation",
    async (summarySource) => {
      const environment: Environment = {
        currentTime: "2026-09-16",
        workspace: {},
        info: {
          os: "darwin",
          shell: "zsh",
          homedir: "/Users/pochi",
          cwd: "/Users/pochi/project",
        },
      };
      const usage = {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      };
      const model = new MockLanguageModelV3({
        doGenerate: {
          content: [
            { type: "text", text: "Summary without system information" },
          ],
          finishReason: { unified: "stop", raw: "stop" },
          usage,
          warnings: [],
        },
        doStream: async () => ({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({ type: "stream-start", warnings: [] });
              controller.enqueue({ type: "text-start", id: "text-1" });
              controller.enqueue({
                type: "text-delta",
                id: "text-1",
                delta: "ok",
              });
              controller.enqueue({ type: "text-end", id: "text-1" });
              controller.enqueue({
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage,
              });
              controller.close();
            },
          }),
        }),
      });
      const messages: Message[] = [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "start" }],
        },
      ];
      prompts.injectEnvironment(messages, environment);
      messages.push(
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "done" }],
        },
        {
          id: "user-2",
          role: "user",
          parts: [{ type: "text", text: "continue" }],
        },
      );
      prompts.injectEnvironment(messages, environment);
      messages.push({
        id: "assistant-2",
        role: "assistant",
        parts: [
          {
            type: "tool-readFile",
            toolCallId: "read-1",
            state: "output-available",
            input: { path: "README.md" },
            output: { content: "contents" },
          },
        ],
      } as Message);
      const store = {
        storeId: "store-1",
        query: () => ({ content: "Task memory without system information" }),
        commit: vi.fn(),
      } as unknown as LiveKitStore;
      await compactTask({
        taskId: "task-1",
        storeId: store.storeId,
        blobStore: {} as BlobStore,
        model,
        messages,
        inline: true,
        ...(summarySource === "task-memory"
          ? { store, taskMemoryBoundaryMessageId: "assistant-2" }
          : {}),
      });
      const assistant = structuredClone(messages.at(-1));
      const onStart = vi.fn<OnStartCallback>();
      const transport = new FlexibleChatTransport({
        store,
        blobStore: {} as BlobStore,
        onStart,
        getters: {
          getLLM: () => ({
            type: "vendor",
            id: "test-model",
            getModel: () => model,
          }),
          getEnvironment: async () => environment,
        },
      });

      for (let attempt = 0; attempt < 2; attempt++) {
        const stream = await transport.sendMessages({
          trigger: "submit-message",
          chatId: "task-1",
          messageId: undefined,
          messages,
          abortSignal: undefined,
        });
        for await (const chunk of stream) {
          expect(chunk.type).not.toBe("error");
        }
        expect(
          parseEnvironmentInfo(model.doStreamCalls[attempt].prompt),
        ).toEqual(environment.info);
      }

      expect(onStart.mock.calls[0][0]).toMatchObject({
        environmentMessage: messages[2],
      });
      expect(onStart.mock.calls[1][0]).not.toHaveProperty(
        "environmentMessage",
        messages[2],
      );
      expect(messages.at(-1)).toEqual(assistant);
    },
  );
});

describe("convertDataPartToText", () => {
    it("renders completed background subagent results for the model", () => {
        const result = convertDataPartToText({
            type: "data-background-job-notification",
            data: { kind: "subagent", notificationId: "bgjob-task-" + "worker" + ":terminal:1", backgroundJobId: "bgjob-task-" + "worker", taskId: "worker", title: "Research", status: "completed", result: "Found the cause." }
        });
        expect(result).toMatchObject({ type: "text", text: expect.stringContaining("Found the cause.") });
        expect(result).toMatchObject({ text: expect.stringContaining("worker") });
    });
    it("passes through parts that are not data parts", () => {
        const part = { type: "text", text: "hello" } as MessagePart;
        expect(convertDataPartToText(part)).toBe(part);
    });
    it("converts data-reviews into a text part", () => {
        const part = {
            type: "data-reviews",
            data: { reviews: [] },
        } as unknown as MessagePart;
        const result = convertDataPartToText(part);
        expect(result).toEqual({ type: "text", text: "" });
    });
    it("returns no text parts when data-active-selection has neither field set", () => {
        const part = {
            type: "data-active-selection",
            data: {},
        } as unknown as MessagePart;
        expect(convertDataPartToText(part)).toEqual([]);
    });
    it("renders only the active file selection when only that field is set", () => {
        const part = {
            type: "data-active-selection",
            data: {
                activeSelection: {
                    filepath: "src/main.ts",
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 1, character: 0 },
                    },
                    content: "const x = 1;",
                },
            },
        } as unknown as MessagePart;
        const result = convertDataPartToText(part) as {
            type: string;
            text: string;
        }[];
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("text");
        expect(result[0].text).toContain("active-selection");
        expect(result[0].text).toContain("const x = 1;");
    });
    it("returns no parts when data-terminal-context has no selections", () => {
        const part = {
            type: "data-terminal-context",
            data: { textSelections: [] },
        } as unknown as MessagePart;
        expect(convertDataPartToText(part)).toEqual([]);
    });
    it("converts data-terminal-context into a single text part with all selections", () => {
        const part = {
            type: "data-terminal-context",
            data: {
                textSelections: [
                    { terminalName: "bash", backgroundJobId: "term-1", content: "echo hello" },
                    { terminalName: "zsh", content: "git status" }
                ],
            },
        } as unknown as MessagePart;
        const result = convertDataPartToText(part) as {
            type: string;
            text: string;
        }[];
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("text");
        expect(result[0].text).toContain("terminal-context-selection terminal=\"bash\"");
        expect(result[0].text).toContain("echo hello");
        expect(result[0].text).toContain("terminal-context-selection terminal=\"zsh\"");
        expect(result[0].text).toContain("git status");
    });
    it("converts one background job notification into one XML text part", () => {
        const part = {
            type: "data-background-job-notification",
            data: {
                notificationId: "bgjob-cmd-1:terminal",
                backgroundJobId: "bgjob-cmd-1",
                outputFile: "/tmp/job<&>.log",
                status: "failed",
                summary: 'Background command "test <all>" failed with exit code 7',
                exitCode: 7,
                finishedAt: 1,
            },
        } as unknown as MessagePart;
        const result = convertDataPartToText(part) as {
            type: string;
            text: string;
        };
        expect(result.type).toBe("text");
        expect(result.text).not.toContain("<system-reminder>");
        expect(result.text).toContain("<background-job-notification>");
        expect(result.text).toContain("/tmp/job&lt;&amp;&gt;.log");
        expect(result.text).toContain("Background command &quot;test &lt;all&gt;&quot; failed with exit code 7");
    });
});
describe("extractContentFilterMetadata", () => {
    it("keeps Anthropic stop details without the rest of provider metadata", () => {
        expect(extractContentFilterMetadata({
            anthropic: {
                stopDetails: {
                    type: "refusal",
                    category: "bio",
                    explanation: "Request blocked by the safety classifier.",
                },
                usage: { input_tokens: 100 },
            },
        }, "content-filter", "refusal")).toEqual({
            provider: "anthropic",
            reason: "refusal",
            details: {
                type: "refusal",
                category: "bio",
                explanation: "Request blocked by the safety classifier.",
            },
        });
    });
    it("records the Anthropic provider when stop details are unavailable", () => {
        expect(extractContentFilterMetadata({
            anthropic: {
                usage: { input_tokens: 100 },
            },
        }, "content-filter", "refusal")).toEqual({ provider: "anthropic", reason: "refusal" });
    });
    it("keeps only Google safety details", () => {
        expect(extractContentFilterMetadata({
            google: {
                promptFeedback: { blockReason: "SAFETY" },
                safetyRatings: [{ category: "HARM_CATEGORY_DANGEROUS_CONTENT" }],
                finishMessage: "Blocked for safety reasons.",
                groundingMetadata: { searchEntryPoint: "unrelated" },
            },
        }, "content-filter", "SAFETY")).toEqual({
            provider: "google",
            reason: "SAFETY",
            details: {
                promptFeedback: { blockReason: "SAFETY" },
                safetyRatings: [{ category: "HARM_CATEGORY_DANGEROUS_CONTENT" }],
                finishMessage: "Blocked for safety reasons.",
            },
        });
    });
    it("reads Google safety details from Vertex metadata", () => {
        expect(extractContentFilterMetadata({
            vertex: {
                promptFeedback: { blockReason: "BLOCKLIST" },
                safetyRatings: [],
                finishMessage: "Blocked by Vertex safety settings.",
            },
        }, "content-filter", "BLOCKLIST")).toEqual({
            provider: "google",
            reason: "BLOCKLIST",
            details: {
                promptFeedback: { blockReason: "BLOCKLIST" },
                safetyRatings: [],
                finishMessage: "Blocked by Vertex safety settings.",
            },
        });
    });
    it("recognizes a prompt-level Google block reported with finish reason other", () => {
        expect(extractContentFilterMetadata({
            google: {
                promptFeedback: { blockReason: "SAFETY" },
                safetyRatings: [],
                finishMessage: null,
            },
        }, "other")).toEqual({
            provider: "google",
            details: {
                promptFeedback: { blockReason: "SAFETY" },
                safetyRatings: [],
                finishMessage: null,
            },
        });
    });
    it("ignores normal Google metadata reported with finish reason other", () => {
        expect(extractContentFilterMetadata({
            google: {
                promptFeedback: { safetyRatings: [] },
                safetyRatings: [],
                finishMessage: null,
            },
        }, "other")).toBeUndefined();
    });
});
describe("getNumCompacts", () => {
    it("counts persisted compact blocks before LLM message trimming", () => {
        const messages = [
            {
                id: "checkpoint-1",
                role: "user",
                parts: [
                    { type: "text", text: "<compact>first summary</compact>" },
                    { type: "text", text: "continue" }
                ],
            },
            {
                id: "checkpoint-2",
                role: "user",
                parts: [{ type: "text", text: "<compact>second summary</compact>" }],
            },
            {
                id: "new-message",
                role: "user",
                parts: [{ type: "text", text: "continue" }],
            }
        ] as Message[];
        expect(getNumCompacts(messages)).toBe(2);
    });
});
