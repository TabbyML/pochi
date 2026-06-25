import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  extractAttemptCompletionResult,
  extractTaskResult,
  formatFollowupQuestions,
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
