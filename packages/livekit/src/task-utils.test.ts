import { describe, expect, it } from "vitest";
import {
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
