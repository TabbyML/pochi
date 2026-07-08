import { describe, expect, it } from "vitest";
import type { Message } from "../../types";
import { getCleanCheckpoint } from "../live-chat-kit";

const checkpoint = (commit: string): Message["parts"][number] =>
  ({
    type: "data-checkpoint",
    data: { commit },
  }) as Message["parts"][number];

const stepStart = (): Message["parts"][number] =>
  ({ type: "step-start" }) as Message["parts"][number];

const writeTool = (path: string): Message["parts"][number] =>
  ({
    type: "tool-writeToFile",
    toolCallId: `write-${path}`,
    state: "output-available",
    input: { path, content: "" },
    output: { success: true },
  }) as Message["parts"][number];

const executeTool = (command: string): Message["parts"][number] =>
  ({
    type: "tool-executeCommand",
    toolCallId: `cmd-${command}`,
    state: "output-available",
    input: { command },
    output: { output: "", isTruncated: false },
  }) as Message["parts"][number];

const attemptCompletionTool = (): Message["parts"][number] =>
  ({
    type: "tool-attemptCompletion",
    toolCallId: "attempt-1",
    state: "input-available",
    input: { result: "done" },
  }) as Message["parts"][number];

const assistant = (parts: Message["parts"]): Message =>
  ({ id: "assistant-1", role: "assistant", parts }) as Message;

const user = (commit: string): Message =>
  ({
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text: "hi" }, checkpoint(commit)],
  }) as Message;

describe("getCleanCheckpoint", () => {
  it("returns the last checkpoint when the task ends on a write", () => {
    // "add 123 to readme" then attemptCompletion.
    const messages = [
      user("c0"),
      assistant([
        stepStart(),
        writeTool("readme.md"),
        checkpoint("c1"),
        stepStart(),
        attemptCompletionTool(),
      ]),
    ];

    expect(getCleanCheckpoint(messages)).toBe("c1");
  });

  it("ignores a trailing read-only command that made no file changes", () => {
    // "add 123 to readme and then echo 'sdfg'": the echo is read-only, so no
    // checkpoint is appended after it, but the tree still matches c1.
    const messages = [
      user("c0"),
      assistant([
        stepStart(),
        writeTool("readme.md"),
        checkpoint("c1"),
        stepStart(),
        executeTool("echo 'sdfg'"),
        stepStart(),
        attemptCompletionTool(),
      ]),
    ];

    expect(getCleanCheckpoint(messages)).toBe("c1");
  });

  it("returns the last checkpoint when the task is only a read-only command", () => {
    const messages = [
      user("c0"),
      assistant([stepStart(), executeTool("ls -la"), checkpoint("c0")]),
    ];

    expect(getCleanCheckpoint(messages)).toBe("c0");
  });

  it("returns undefined when a file-writing command is the final action", () => {
    // A command that redirects output to a file is not read-only, so with no
    // checkpoint captured after it the tree is considered dirty.
    const messages = [
      user("c0"),
      assistant([
        stepStart(),
        writeTool("readme.md"),
        checkpoint("c1"),
        stepStart(),
        executeTool("echo x >> readme.md"),
      ]),
    ];

    expect(getCleanCheckpoint(messages)).toBeUndefined();
  });

  it("returns undefined when a write is the final action with no checkpoint after it", () => {
    const messages = [
      user("c0"),
      assistant([stepStart(), writeTool("readme.md")]),
    ];

    expect(getCleanCheckpoint(messages)).toBeUndefined();
  });

  it("returns undefined when there is no checkpoint at all", () => {
    const messages = [assistant([stepStart(), attemptCompletionTool()])];

    expect(getCleanCheckpoint(messages)).toBeUndefined();
  });
});
