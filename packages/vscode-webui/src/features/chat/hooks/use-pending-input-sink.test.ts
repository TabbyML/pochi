// @vitest-environment jsdom
import type { QueuedUserInput } from "@getpochi/livekit";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  getTodoModeObjective,
  toDraftMessage,
  usePendingInputSink,
} from "./use-pending-input-sink";

const vscodeMocks = vi.hoisted(() => ({
  readQueuedUserInputs: vi.fn(async (_taskId: string) => [] as unknown[]),
  saveQueuedUserInputs: vi.fn(async (_taskId: string, _inputs: unknown[]) => {}),
}));

vi.mock("@/lib/vscode", () => ({
  vscodeHost: vscodeMocks,
}));

describe("usePendingInputSink", () => {
  it("mirrors pending input and persists queued inputs per task", async () => {
    const onTakeUserInputs = vi.fn();
    const { result } = renderHook(() =>
      usePendingInputSink("task-1", { current: onTakeUserInputs }),
    );
    const { options } = result.current;
    const input = queuedInput({ text: "queued" });

    act(() => {
      options.onChange?.({ userInputs: [input], notifications: [] });
    });
    expect(result.current.pending.userInputs).toEqual([input]);

    options.onTakeUserInputs?.([input]);
    expect(onTakeUserInputs).toHaveBeenCalledWith([input]);

    vscodeMocks.readQueuedUserInputs.mockResolvedValueOnce([input]);
    await expect(options.storage?.load()).resolves.toEqual([input]);
    expect(vscodeMocks.readQueuedUserInputs).toHaveBeenCalledWith("task-1");

    await options.storage?.save([input]);
    expect(vscodeMocks.saveQueuedUserInputs).toHaveBeenCalledWith("task-1", [
      input,
    ]);
  });
});

describe("toDraftMessage", () => {
  it("recovers the draft message stored with the input", () => {
    const draft = {
      input: { json: null, text: "queued" },
      attachments: [],
    };
    expect(
      toDraftMessage(queuedInput({ text: "queued", isTodoMode: true, draft })),
    ).toEqual({
      parts: [{ type: "text", text: "queued" }],
      raw: { text: "queued", isTodoMode: true },
      draft,
    });
  });

  it("falls back to the text parts without display data", () => {
    expect(
      toDraftMessage({
        id: "queued-1",
        parts: [
          { type: "text", text: "first" },
          { type: "text", text: "second" },
        ],
      }),
    ).toEqual({
      parts: [
        { type: "text", text: "first" },
        { type: "text", text: "second" },
      ],
      raw: { text: "first\nsecond" },
      draft: undefined,
    });
  });
});

describe("getTodoModeObjective", () => {
  it("uses the first todo-mode input", () => {
    expect(
      getTodoModeObjective([
        queuedInput({ text: "regular" }),
        queuedInput({ text: "audit this", isTodoMode: true }),
        queuedInput({ text: "audit that", isTodoMode: true }),
      ]),
    ).toBe("audit this");
  });

  it("returns undefined without a todo-mode input", () => {
    expect(getTodoModeObjective([queuedInput({ text: "regular" })])).toBe(
      undefined,
    );
  });
});

function queuedInput({
  text,
  isTodoMode,
  draft,
}: {
  text: string;
  isTodoMode?: boolean;
  draft?: unknown;
}): QueuedUserInput {
  return {
    id: `queued-${text}`,
    parts: [{ type: "text", text }],
    display: {
      raw: { text, ...(isTodoMode ? { isTodoMode } : {}) },
      draft,
    },
  };
}
