import { describe, expect, it } from "vitest";
import type { Message } from "../../types";
import { replaceAttemptCompletionWithTodoSubtask } from "../todo-completion-utils";

describe("replaceAttemptCompletionWithTodoSubtask", () => {
  it("replaces the last-step attemptCompletion with an attemptTodoCompletion newTask", () => {
    const message: Message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-attemptCompletion",
          toolCallId: "tool-1",
          state: "input-available",
          input: {
            result: "The implementation is complete.",
          },
        },
      ],
    } as never;

    const result = replaceAttemptCompletionWithTodoSubtask(
      message,
      [
        {
          id: "todo-1",
          content: "Implement todo mode",
          status: "in-progress",
          priority: "medium",
        },
      ],
      {
        toolCallId: "audit-tool-1",
        uid: "audit-task-1",
      },
    );

    expect(result.parts).toHaveLength(2);
    expect(result.parts[1]).toMatchObject({
      type: "tool-newTask",
      toolCallId: "audit-tool-1",
      state: "input-available",
      input: {
        agentType: "attemptTodoCompletion",
        description: "",
        _meta: {
          uid: "audit-task-1",
          sourceAttemptCompletion: {
            toolCallId: "tool-1",
            input: {
              result: "The implementation is complete.",
            },
          },
          todos: [
            {
              id: "todo-1",
              content: "Implement todo mode",
              status: "in-progress",
              priority: "medium",
            },
          ],
        },
      },
    });
    const prompt = (
      result.parts[1] as Extract<
        Message["parts"][number],
        { type: "tool-newTask" }
      >
    ).input?.prompt;
    expect(prompt).toBe([
      "Audit whether the todo is complete in the current workspace.",
      "",
      "",
      "**Prior work summary**",
      "The implementation is complete.",
    ].join("\n"));
  });

  it("renders multi-line prior summaries without XML tags or blockquotes", () => {
    const message: Message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-attemptCompletion",
          toolCallId: "tool-1",
          state: "input-available",
          input: {
            result: "First line.\nSecond line.",
          },
        },
      ],
    } as never;

    const result = replaceAttemptCompletionWithTodoSubtask(
      message,
      [
        {
          id: "todo-1",
          content: "Ship the requested feature",
          status: "in-progress",
          priority: "medium",
        },
      ],
    );

    const prompt = (
      result.parts[1] as Extract<
        Message["parts"][number],
        { type: "tool-newTask" }
      >
    ).input?.prompt;
    expect(prompt).toContain("**Prior work summary**\nFirst line.\nSecond line.");
    expect(prompt).not.toContain("> First line.");
    expect(prompt).not.toContain("<attemptCompletionResult>");
  });

  it("copies call provider metadata from the original attemptCompletion part", () => {
    const callProviderMetadata = {
      google: {
        thoughtSignature: "signature-1",
      },
    };
    const message: Message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-attemptCompletion",
          toolCallId: "tool-1",
          state: "input-available",
          input: {
            result: "The implementation is complete.",
          },
          callProviderMetadata,
        },
      ],
    } as never;

    const result = replaceAttemptCompletionWithTodoSubtask(
      message,
      [
        {
          id: "todo-1",
          content: "Implement todo mode",
          status: "in-progress",
          priority: "medium",
        },
      ],
      {
        toolCallId: "audit-tool-1",
        uid: "audit-task-1",
      },
    );

    expect(result.parts[1]).toMatchObject({
      type: "tool-newTask",
      callProviderMetadata,
    });
  });

  it("does not rewrite earlier attemptCompletion calls from previous steps", () => {
    const message: Message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-attemptCompletion",
          toolCallId: "tool-1",
          state: "input-available",
          input: {
            result: "Earlier result.",
          },
        },
        { type: "step-start" },
        {
          type: "tool-executeCommand",
          toolCallId: "tool-2",
          state: "input-available",
          input: {
            command: "pwd",
          },
        },
      ],
    } as never;

    const result = replaceAttemptCompletionWithTodoSubtask(message, [
      {
        id: "todo-1",
        content: "Implement todo mode",
        status: "in-progress",
        priority: "medium",
      },
    ]);

    expect(result).toBe(message);
  });
});
