import { describe, it, expect } from "bun:test";
import {
  resolvePendingToolCalls,
  removeDeprecatedToolInvocations,
  stripKnownXMLTags,
  combineConsecutiveAssistantMessages,
  removeSystemReminder,
} from "../formatters";
import { type UIMessage } from "ai";

describe("formatters individual ops", () => {
  describe("resolvePendingToolCalls", () => {
    it("should resolve pending tool calls", () => {
      const messages: UIMessage[] = [
        {
          id: "1",
          role: "assistant",
          content: "",
          parts: [
            {
              type: "tool-invocation",
              toolInvocation: {
                toolCallId: "tc-1",
                toolName: "test-tool",
                args: {},
                state: "call",
              },
            },
          ],
        },
        {
          id: "2",
          role: "user",
          content: "hello",
          parts: [{ type: "text", text: "hello" }],
        },
      ];
      const expectedMessages: UIMessage[] = [
        {
          id: "1",
          role: "assistant",
          content: "",
          parts: [
            {
              type: "tool-invocation",
              toolInvocation: {
                toolCallId: "tc-1",
                toolName: "test-tool",
                args: {},
                state: "result",
                result: {
                  error: "User cancelled the tool call.",
                },
              },
            },
          ],
        },
        {
          id: "2",
          role: "user",
          content: "hello",
          parts: [{ type: "text", text: "hello" }],
        },
      ];
      const result = resolvePendingToolCalls(messages);
      expect(result).toEqual(expectedMessages);
    });

    it("should resolve pending user input tool calls", () => {
      const messages: UIMessage[] = [
        {
          id: "1",
          role: "assistant",
          content: "",
          parts: [
            {
              type: "tool-invocation",
              toolInvocation: {
                toolCallId: "tc-2",
                toolName: "askFollowupQuestion",
                args: {},
                state: "call",
              },
            },
          ],
        },
        {
          id: "2",
          role: "user",
          content: "hello",
          parts: [{ type: "text", text: "hello" }],
        },
      ];
      const expectedMessages: UIMessage[] = [
        {
          id: "1",
          role: "assistant",
          content: "",
          parts: [
            {
              type: "tool-invocation",
              toolInvocation: {
                toolCallId: "tc-2",
                toolName: "askFollowupQuestion",
                args: {},
                state: "result",
                result: {
                  error: { success: true },
                },
              },
            },
          ],
        },
        {
          id: "2",
          role: "user",
          content: "hello",
          parts: [{ type: "text", text: "hello" }],
        },
      ];
      const result = resolvePendingToolCalls(messages);
      expect(result).toEqual(expectedMessages);
    });
  });

  describe("removeDeprecatedToolInvocations", () => {
    it("should remove deprecated tool invocations", () => {
      const messages: UIMessage[] = [
        {
          id: "1",
          role: "assistant",
          content: "",
          parts: [],
          toolInvocations: [
            {
              toolCallId: "ti-1",
              toolName: "test-tool",
              args: {},
              state: "result",
              result: {},
            },
          ],
        },
      ];
      const expectedMessages: UIMessage[] = [
        {
          id: "1",
          role: "assistant",
          content: "",
          parts: [],
          toolInvocations: undefined,
        },
      ];
      const result = removeDeprecatedToolInvocations(messages);
      expect(result).toEqual(expectedMessages);
    });
  });

  describe("stripKnownXMLTags", () => {
    it("should strip known XML tags and update message content", () => {
      const messages: UIMessage[] = [
        {
          id: "1",
          role: "user",
          content: "<file path='test.txt'>content</file>",
          parts: [
            { type: "text", text: "<file path='test.txt'>content</file>" },
          ],
        },
      ];
      const expectedMessages: UIMessage[] = [
        {
          id: "1",
          role: "user",
          content: "<file path='test.txt'>content</file>", // Content field is not updated
          parts: [{ type: "text", text: "content" }],
        },
      ];
      const result = stripKnownXMLTags(messages);
      expect(result).toEqual(expectedMessages);
    });

    it("should not strip unknown <system-reminder> tags", () => {
      const messages: UIMessage[] = [
        {
          id: "1",
          role: "user",
          content: "",
          parts: [
            {
              type: "text",
              text: "<system-reminder>this is a reminder</system-reminder>",
            },
          ],
        },
      ];
      const expectedMessages: UIMessage[] = [
        {
          id: "1",
          role: "user",
          content: "",
          parts: [{ type: "text", text: "<system-reminder>this is a reminder</system-reminder>" }],
        },
      ];
      const result = stripKnownXMLTags(messages);
      expect(result).toEqual(expectedMessages);
    });
  });

  describe("removeSystemReminderMessage", () => {
    it("should remove user reminder messages", () => {
      const messages: UIMessage[] = [
        {
          id: "1",
          role: "user",
          content: "<system-reminder>Remember this</system-reminder>",
          parts: [
            {
              type: "text",
              text: "<system-reminder>Remember this</system-reminder>",
            },
            {
              // @ts-expect-error
              type: "checkpoint"
            }
          ],
        },
        {
          id: "2",
          role: "user",
          content: "Not a reminder",
          parts: [{ type: "text", text: "Not a reminder" }],
        },
        {
          id: "3",
          role: "user",
          content: "",
          parts: [
            {
              type: "text",
              text: "<system-reminder>Remember this</system-reminder>",
            },
            {
              type: "text",
              text: "nice",
            },
          ],
        },
      ];
      const expectedMessages: UIMessage[] = [
        {
          id: "2",
          role: "user",
          content: "Not a reminder",
          parts: [{ type: "text", text: "Not a reminder" }],
        },
        {
          id: "3",
          role: "user",
          content: "",
          parts: [{ type: "text", text: "nice" }],
        },
      ];
      const result = removeSystemReminder(messages);
      expect(result).toEqual(expectedMessages);
    });
  });

  describe("combineConsecutiveAssistantMessages", () => {
    it("should combine consecutive assistant messages, including content", () => {
      const messages: UIMessage[] = [
        {
          id: "1",
          role: "assistant",
          content: "Hello",
          parts: [{ type: "text", text: "Hello" }],
        },
        {
          id: "2",
          role: "assistant",
          content: "World",
          parts: [{ type: "text", text: "World" }],
        },
        {
          id: "3",
          role: "user",
          content: "User message",
          parts: [{ type: "text", text: "User message" }],
        },
        {
          id: "4",
          role: "assistant",
          content: "Another assistant message",
          parts: [{ type: "text", text: "Another assistant message" }],
        },
      ];
      const expectedMessages: UIMessage[] = [
        {
          id: "1",
          role: "assistant",
          content: "Hello", // Expect content of the first message
          parts: [
            { type: "text", text: "Hello" },
            { type: "text", text: "World" },
          ],
        },
        {
          id: "3",
          role: "user",
          content: "User message",
          parts: [{ type: "text", text: "User message" }],
        },
        {
          id: "4",
          role: "assistant",
          content: "Another assistant message",
          parts: [{ type: "text", text: "Another assistant message" }],
        },
      ];
      const result = combineConsecutiveAssistantMessages(messages);
      expect(result).toEqual(expectedMessages);
    });
  });
});

