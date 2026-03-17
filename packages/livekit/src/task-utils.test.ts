import { describe, expect, it } from "vitest";
import {
  extractTaskResult,
  extractWebhookFollowups,
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
          },
          {
            header: "Motion",
            question: "Should we add animations?",
            options: [{ label: "Yes" }, { label: "No" }],
          },
        ],
      }),
    ).toBe(
      "[Theme] Which color theme would you like?\n- Primary\n- Secondary\n\n[Motion] Should we add animations?\n- Yes\n- No",
    );
  });
});

describe("extractWebhookFollowups", () => {
  it("returns all structured follow-up questions for webhook consumers", () => {
    expect(
      extractWebhookFollowups({
        questions: [
          {
            header: "Theme",
            question: "Which color theme would you like?",
            options: [{ label: "Primary" }, { label: "Secondary" }],
          },
          {
            header: "Motion",
            question: "Should we add animations?",
            options: [{ label: "Yes" }, { label: "No" }],
          },
        ],
      }),
    ).toEqual([
      {
        header: "Theme",
        question: "Which color theme would you like?",
        choices: ["Primary", "Secondary"],
      },
      {
        header: "Motion",
        question: "Should we add animations?",
        choices: ["Yes", "No"],
      },
    ]);
  });
});

describe("extractTaskResult", () => {
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
                    },
                    {
                      header: "Motion",
                      question: "Should we add animations?",
                      options: [{ label: "Yes" }, { label: "No" }],
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
