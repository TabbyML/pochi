import { describe, it, expect } from "vitest";
import { filterCompletionTools } from "../filter-completion-tools";
import type { Message } from "../../types";

describe("filterCompletionTools", () => {
  it("should return the same message if only completion tools are present in the last step", () => {
    const message: Message = {
      id: "1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { 
          type: "tool-attemptCompletion", 
          toolCallId: "tool-1", 
          state: "input-available", 
          input: {} as any 
        },
      ] as any,
    } as any;

    const result = filterCompletionTools(message);
    expect(result).toEqual(message);
  });

  it("should return the same message if only other tools are present in the last step", () => {
    const message: Message = {
      id: "2",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { 
          type: "tool-executeCommand", 
          toolCallId: "tool-1", 
          state: "input-available", 
          input: {} as any 
        },
      ] as any,
    } as any;

    const result = filterCompletionTools(message);
    expect(result).toEqual(message);
  });

  it("should filter out completion tools if both completion and other tools are present in the last step", () => {
    const message: Message = {
      id: "3",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { 
          type: "tool-executeCommand", 
          toolCallId: "tool-1", 
          state: "input-available", 
          input: {} as any 
        },
        { 
          type: "tool-attemptCompletion", 
          toolCallId: "tool-2", 
          state: "input-available", 
          input: {} as any 
        },
      ] as any,
    } as any;

    const result = filterCompletionTools(message);
    expect(result.parts).toHaveLength(2);
    expect(result.parts[0]).toEqual({ type: "step-start" });
    expect(result.parts[1]).toEqual({ 
      type: "tool-executeCommand", 
      toolCallId: "tool-1", 
      state: "input-available", 
      input: {} 
    });
  });

  it("should ignore todoWrite when deciding whether to filter", () => {
    const message: Message = {
      id: "4",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { 
          type: "tool-todoWrite", 
          toolCallId: "tool-1", 
          state: "input-available", 
          input: {} as any 
        },
        { 
          type: "tool-attemptCompletion", 
          toolCallId: "tool-2", 
          state: "input-available", 
          input: {} as any 
        },
      ] as any,
    } as any;

    const result = filterCompletionTools(message);
    expect(result).toEqual(message);
  });

  it("should handle multiple steps and only filter the last step", () => {
    const message: Message = {
      id: "5",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { 
          type: "tool-executeCommand", 
          toolCallId: "tool-1", 
          state: "input-available", 
          input: {} as any 
        },
        { 
          type: "tool-attemptCompletion", 
          toolCallId: "tool-2", 
          state: "input-available", 
          input: {} as any 
        },
        { type: "step-start" },
        { 
          type: "tool-executeCommand", 
          toolCallId: "tool-3", 
          state: "input-available", 
          input: {} as any 
        },
        { 
          type: "tool-askFollowupQuestion", 
          toolCallId: "tool-4", 
          state: "input-available", 
          input: {} as any 
        },
      ] as any,
    } as any;

    const result = filterCompletionTools(message);
    expect(result.parts).toHaveLength(5);
    expect(result.parts[result.parts.length - 1]).toEqual({
      type: "tool-executeCommand",
      toolCallId: "tool-3",
      state: "input-available",
      input: {},
    });
  });
});
