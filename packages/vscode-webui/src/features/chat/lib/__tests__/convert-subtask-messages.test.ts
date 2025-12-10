import { describe, expect, it, vi } from "vitest";
import { convertSubtaskMessages } from "../convert-subtask-messages";
import type { Message } from "@getpochi/livekit";
import type { TFunction } from "i18next";

describe("convertSubtaskMessages", () => {
  const mockT = vi.fn((key: string) => key) as unknown as TFunction<"translation", undefined>;

  it("should return messages as is if no tool-newTask part is present", () => {
    const messages: Message[] = [
      {
        id: "1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
      },
    ];
    const result = convertSubtaskMessages(messages, mockT);
    expect(result).toEqual(messages);
  });

  it("should convert tool-newTask part with output-available and result", () => {
    const messages: Message[] = [
      {
        id: "2",
        role: "assistant",
        parts: [
          {
            type: "tool-newTask",
            toolCallId: "tool-call-id-1",
            state: "output-available",
            input: { agentType: "explore", description: "Explore codebase", prompt: "explore" },
            output: { result: "Codebase explored successfully" },
          },
        ],
      },
    ];
    const result = convertSubtaskMessages(messages, mockT);
    expect(result[0].parts[0]).toEqual({
      type: "text",
      text: "#### [explore] Explore codebase  \nforkTask.subTaskSummary.completed  \nCodebase explored successfully",
    });
  });

  it("should convert tool-newTask part with output-available and error in output", () => {
    const messages: Message[] = [
      {
        id: "3",
        role: "assistant",
        parts: [
          {
            type: "tool-newTask",
            toolCallId: "tool-call-id-2",
            state: "output-available",
            input: { agentType: "debugger", description: "Debug issue", prompt: "debug" },
            output: { error: "Debugging failed" } as any,
          },
        ],
      },
    ];
    const result = convertSubtaskMessages(messages, mockT);
    expect(result[0].parts[0]).toEqual({
      type: "text",
      text: "#### [debugger] Debug issue  \nforkTask.subTaskSummary.error \nDebugging failed",
    });
  });

  it("should convert tool-newTask part with output-error state", () => {
    const messages: Message[] = [
      {
        id: "4",
        role: "assistant",
        parts: [
          {
            type: "tool-newTask",
            toolCallId: "tool-call-id-3",
            state: "output-error",
            input: { description: "Perform task", prompt: "task" },
            errorText: "Task execution failed",
          },
        ],
      },
    ];
    const result = convertSubtaskMessages(messages, mockT);
    expect(result[0].parts[0]).toEqual({
      type: "text",
      text: "#### [Subtask] Perform task  \nforkTask.subTaskSummary.error \nTask execution failed",
    });
  });

  it("should handle multiple parts and messages", () => {
    const messages: Message[] = [
      {
        id: "6",
        role: "user",
        parts: [{ type: "text", text: "First message" }],
      },
      {
        id: "7",
        role: "assistant",
        parts: [
          { type: "text", text: "Before subtask" },
          {
            type: "tool-newTask",
            toolCallId: "tool-call-id-4",
            state: "output-available",
            input: { description: "Another subtask", prompt: "another subtask" },
            output: { result: "Subtask done" },
          },
          { type: "text", text: "After subtask" },
        ],
      },
    ];
    const result = convertSubtaskMessages(messages, mockT);
    expect(result[0]).toEqual(messages[0]);
    expect(result[1].parts[0]).toEqual(messages[1].parts[0]);
    expect(result[1].parts[1]).toEqual({
      type: "text",
      text: "#### [Subtask] Another subtask  \nforkTask.subTaskSummary.completed  \nSubtask done",
    });
    expect(result[1].parts[2]).toEqual(messages[1].parts[2]);
  });
});