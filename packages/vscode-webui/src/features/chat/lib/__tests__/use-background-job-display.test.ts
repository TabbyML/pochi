import type { Message } from "@getpochi/livekit";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useBackgroundJobDisplay } from "../use-background-job-display";

function messagesWithJob(backgroundJobId: string, command: string): Message[] {
  return [
    {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "tool-executeCommand",
          toolCallId: "tool-1",
          state: "output-available",
          input: { command },
          output: { output: "", _meta: { backgroundJobId } },
        },
      ],
    } as Message,
  ];
}

function replaceIn(content: string, messages: Message[]) {
  const { result } = renderHook(() => useBackgroundJobDisplay(messages));
  return result.current.replaceJobIdsInContent(content);
}

describe("replaceJobIdsInContent", () => {
  const messages = messagesWithJob("bgjob-cmd-abc", "bun run dev");

  it("replaces a mentioned job id with its display id", () => {
    expect(replaceIn("started bgjob-cmd-abc now", messages)).toBe(
      "started %1 now",
    );
  });

  it("keeps the job id inside its output file path", () => {
    const path = "pochi://~/background-jobs/bgjob-cmd-abc.log";
    expect(replaceIn(`output at ${path}`, messages)).toBe(`output at ${path}`);
  });

  it("keeps the job id inside a windows output file path", () => {
    const path = "C:\\tmp\\background-jobs\\bgjob-cmd-abc.log";
    expect(replaceIn(`output at ${path}`, messages)).toBe(`output at ${path}`);
  });

  it("replaces mentions while preserving paths in the same content", () => {
    expect(
      replaceIn(
        "bgjob-cmd-abc writes to /tmp/background-jobs/bgjob-cmd-abc.log",
        messages,
      ),
    ).toBe("%1 writes to /tmp/background-jobs/bgjob-cmd-abc.log");
  });

  it("numbers multiple jobs independently", () => {
    const twoJobs: Message[] = [
      ...messagesWithJob("bgjob-cmd-abc", "bun run dev"),
      ...messagesWithJob("bgjob-cmd-xyz", "bun run test"),
    ];
    expect(replaceIn("bgjob-cmd-abc and bgjob-cmd-xyz", twoJobs)).toBe(
      "%1 and %2",
    );
  });

  it("leaves content untouched when there are no background jobs", () => {
    expect(replaceIn("nothing to replace", [])).toBe("nothing to replace");
  });
});
