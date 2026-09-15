import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createSubAgentResultNotification,
  extractAttemptCompletionResult,
  extractTaskResult,
  formatFollowupQuestions,
  isAwaitingFollowupAnswer,
} from "./task-utils";

describe("formatFollowupQuestions", () => {
  it("formats all questions from the new askFollowupQuestion payload", () => {
    expect(
      formatFollowupQuestions({
        questions: [
          {
            header: "Theme",
            question: "Which color theme would you like?",
            options: [{ label: "Primary" }, { label: "Secondary" }],
            multiSelect: false,
          },
          {
            header: "Motion",
            question: "Should we add animations?",
            options: [{ label: "Yes" }, { label: "No" }],
            multiSelect: false,
          },
        ],
      }),
    ).toBe(
      "[Theme] Which color theme would you like?\n- Primary\n- Secondary\n\n[Motion] Should we add animations?\n- Yes\n- No",
    );
  });
});

describe("isAwaitingFollowupAnswer", () => {
  const message = (parts: unknown[]) =>
    ({ role: "assistant", parts }) as any;

  it("detects an unanswered question in the last step", () => {
    expect(
      isAwaitingFollowupAnswer(
        message([
          { type: "step-start" },
          { type: "tool-askFollowupQuestion", state: "input-available" },
        ]),
      ),
    ).toBe(true);
  });

  it("ignores an answered question", () => {
    expect(
      isAwaitingFollowupAnswer(
        message([
          { type: "step-start" },
          { type: "tool-askFollowupQuestion", state: "output-available" },
        ]),
      ),
    ).toBe(false);
  });

  it("ignores a question from an earlier step", () => {
    expect(
      isAwaitingFollowupAnswer(
        message([
          { type: "step-start" },
          { type: "tool-askFollowupQuestion", state: "input-available" },
          { type: "step-start" },
          { type: "tool-readFile", state: "input-available" },
        ]),
      ),
    ).toBe(false);
  });

  it("returns false without a message", () => {
    expect(isAwaitingFollowupAnswer(undefined)).toBe(false);
  });
});

describe("extractTaskResult", () => {
  it("returns structured attemptCompletion results", () => {
    const result = {
      success: true,
      summary: "Audit passed.",
    };
    const store = {
      query: () => [
        {
          data: {
            parts: [
              { type: "step-start" },
              {
                type: "tool-attemptCompletion",
                state: "output-available",
                input: {
                  result,
                },
              },
            ],
          },
        },
      ],
    } as any;

    expect(extractTaskResult(store, "task-1")).toEqual(result);
  });

  it("returns the full formatted follow-up payload", () => {
    const store = {
      query: () => [
        {
          data: {
            parts: [
              { type: "step-start" },
              {
                type: "tool-askFollowupQuestion",
                state: "input-available",
                input: {
                  questions: [
                    {
                      header: "Theme",
                      question: "Which color theme would you like?",
                      options: [{ label: "Primary" }, { label: "Secondary" }],
                      multiSelect: false,
                    },
                    {
                      header: "Motion",
                      question: "Should we add animations?",
                      options: [{ label: "Yes" }, { label: "No" }],
                      multiSelect: false,
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    } as any;

    expect(extractTaskResult(store, "task-1")).toBe(
      "[Theme] Which color theme would you like?\n- Primary\n- Secondary\n\n[Motion] Should we add animations?\n- Yes\n- No",
    );
  });
});

describe("extractAttemptCompletionResult", () => {
  it("returns structured attemptCompletion result from the last step", () => {
    const store = {
      query: () => [
        {
          data: {
            parts: [
              { type: "step-start" },
              {
                type: "tool-attemptCompletion",
                state: "input-available",
                input: {
                  result: "old step",
                },
              },
              { type: "step-start" },
              {
                type: "tool-attemptCompletion",
                state: "output-available",
                input: {
                  result: {
                    success: true,
                    summary: "Current state proves completion.",
                  },
                },
                output: { success: true },
              },
            ],
          },
        },
      ],
    } as any;

    expect(
      extractAttemptCompletionResult(
        store,
        "task-1",
        z.object({
          success: z.boolean(),
          summary: z.string(),
        }),
      ),
    ).toEqual({
      success: true,
      summary: "Current state proves completion.",
    });
  });

  it("throws when the structured attemptCompletion result is invalid", () => {
    const store = {
      query: () => [
        {
          data: {
            parts: [
              { type: "step-start" },
              {
                type: "tool-attemptCompletion",
                state: "input-available",
                input: {
                  result: {
                    success: "true",
                    summary: "Invalid",
                  },
                },
              },
            ],
          },
        },
      ],
    } as any;

    expect(() =>
      extractAttemptCompletionResult(
        store,
        "task-1",
        z.object({
          success: z.boolean(),
          summary: z.string(),
        }),
      ),
    ).toThrow("Invalid attemptCompletion result");
  });
});

describe("subagent stop notification", () => {
  it("distinguishes user cancellation from execution failure", () => {
    const store = {} as Parameters<typeof createSubAgentResultNotification>[0];
    const task = { id: "child", title: "Review", status: "failed", error: { kind: "AbortError", message: "Stopped by user." } } as Parameters<typeof createSubAgentResultNotification>[1];
    expect(createSubAgentResultNotification(store, task, [])).toMatchObject({ kind: "subagent", status: "stopped" });
    expect(createSubAgentResultNotification(store, task, [])).not.toHaveProperty("finishedAt");
    expect(createSubAgentResultNotification(store, { ...task, error: { kind: "InternalError", message: "Failed" } }, [])).not.toHaveProperty("stopped");
  });
});

describe("subagent notification identity", () => {
  it("matches explore calls by task ID and preserves their descriptions", () => {
    const messages = [{ id: "parent", role: "assistant", parts: [
      { type: "tool-newTask", toolCallId: "first", state: "output-available", input: { agentType: "explore", description: "Inspect structure", prompt: "Inspect", _meta: { uid: "first" } }, output: { result: "Started" } },
      { type: "tool-newTask", toolCallId: "second", state: "output-available", input: { agentType: "explore", description: "Inspect tests", prompt: "Inspect", _meta: { uid: "second" } }, output: { result: "Started" } },
    ] }] as Parameters<typeof createSubAgentResultNotification>[2];
    const store = { query: () => [] } as unknown as Parameters<typeof createSubAgentResultNotification>[0];
    for (const status of ["completed", "failed"] as const) {
      const task = { id: "second", title: null, status, error: null };
      expect(createSubAgentResultNotification(store, task, messages)).toMatchObject({ agentType: "explore", title: "Inspect tests" });
      expect(createSubAgentResultNotification(store, { ...task, title: "Existing title" }, messages)).toMatchObject({ agentType: "explore", title: "Existing title" });
    }
  });
});
