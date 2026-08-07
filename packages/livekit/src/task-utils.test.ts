import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  collectPreviouslyReadFilePaths,
  extractAttemptCompletionResult,
  extractTaskResult,
  formatFollowupQuestions,
} from "./task-utils";

describe("collectPreviouslyReadFilePaths", () => {
  it("collects unique paths from successful file reads and writes", () => {
    const messages = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-readFile",
            toolCallId: "read-1",
            state: "output-available",
            input: { path: "src/index.ts" },
            output: { content: "first", isTruncated: false },
          },
          {
            type: "tool-readFile",
            toolCallId: "read-2",
            state: "output-available",
            input: { path: "src/index.ts", startLine: 1, endLine: 10 },
            output: { content: "first", isTruncated: false },
          },
          {
            type: "tool-readFile",
            toolCallId: "read-3",
            state: "output-available",
            input: { path: "src/other.ts" },
            output: { error: "File not found" },
          },
          {
            type: "tool-writeToFile",
            toolCallId: "write-1",
            state: "output-available",
            input: { path: "src/generated.ts", content: "generated" },
            output: { success: true },
          },
          {
            type: "tool-applyDiff",
            toolCallId: "write-2",
            state: "output-available",
            input: { path: "src/index.ts", patch: "patch" },
            output: { success: true },
          },
          {
            type: "tool-editNotebook",
            toolCallId: "write-3",
            state: "output-available",
            input: { path: "notebooks/demo.ipynb", edits: [] },
            output: { success: true },
          },
          {
            type: "tool-multiApplyDiff",
            toolCallId: "write-legacy",
            state: "output-available",
            input: { path: "src/legacy.ts", edits: [] },
            output: { success: true },
          },
          {
            type: "tool-writeToFile",
            toolCallId: "write-failed",
            state: "output-available",
            input: { path: "src/failed.ts", content: "failed" },
            output: { error: "Write failed" },
          },
        ],
      },
    ] as any;

    expect(collectPreviouslyReadFilePaths(messages)).toEqual([
      "src/index.ts",
      "src/generated.ts",
      "notebooks/demo.ipynb",
      "src/legacy.ts",
    ]);
  });
});

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
