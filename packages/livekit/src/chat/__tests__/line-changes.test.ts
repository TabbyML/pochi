import { describe, expect, it } from "vitest";
import type { Message } from "../../types";
import { computeLineChanges } from "../line-changes";

type Part = Message["parts"][number];

const editTool = (
  type: "tool-writeToFile" | "tool-applyDiff" | "tool-multiApplyDiff",
  editSummary: unknown,
  state: "output-available" | "input-available" = "output-available",
): Part =>
  ({
    type,
    toolCallId: `${type}-${JSON.stringify(editSummary)}`,
    state,
    input: { path: "a.ts" },
    ...(state === "output-available"
      ? { output: { success: true, _meta: { edit: "", editSummary } } }
      : {}),
  }) as Part;

const message = (role: Message["role"], parts: Part[]): Message =>
  ({ id: crypto.randomUUID(), role, parts }) as Message;

describe("computeLineChanges", () => {
  it("sums the edit summaries of all file-editing tool calls", () => {
    const messages = [
      message("user", [{ type: "text", text: "edit files" }]),
      message("assistant", [
        editTool("tool-writeToFile", { added: 10, removed: 0 }),
        editTool("tool-applyDiff", { added: 2, removed: 3 }),
      ]),
      message("user", [{ type: "text", text: "more" }]),
      message("assistant", [
        editTool("tool-multiApplyDiff", { added: 1, removed: 4 }),
      ]),
    ];

    expect(computeLineChanges(messages)).toEqual({ added: 13, removed: 7 });
  });

  it("counts repeated edits to the same lines every time", () => {
    const messages = [
      message("assistant", [
        editTool("tool-applyDiff", { added: 1, removed: 1 }),
        editTool("tool-applyDiff", { added: 1, removed: 1 }),
      ]),
    ];

    expect(computeLineChanges(messages)).toEqual({ added: 2, removed: 2 });
  });

  it("ignores tool calls without a result", () => {
    const messages = [
      message("assistant", [
        editTool("tool-applyDiff", { added: 5, removed: 5 }, "input-available"),
      ]),
    ];

    expect(computeLineChanges(messages)).toEqual({ added: 0, removed: 0 });
  });

  it("ignores outputs without a valid edit summary", () => {
    const messages = [
      message("assistant", [
        {
          type: "tool-executeCommand",
          toolCallId: "cmd",
          state: "output-available",
          input: { command: "rm a.ts" },
          output: { output: "", isTruncated: false },
        } as Part,
        editTool("tool-writeToFile", undefined),
        editTool("tool-writeToFile", { added: "1", removed: 0 }),
        editTool("tool-writeToFile", { added: -1, removed: 0 }),
        { type: "text", text: "done" },
      ]),
    ];

    expect(computeLineChanges(messages)).toEqual({ added: 0, removed: 0 });
  });
});
