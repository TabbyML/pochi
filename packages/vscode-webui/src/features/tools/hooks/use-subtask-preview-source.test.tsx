// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SubtaskPreviewSourceThrottleMs,
  useSubtaskPreviewSource,
} from "./use-subtask-preview-source";

function makeSource(text: string) {
  return {
    parentId: "parent",
    messages: [
      {
        id: text,
        role: "assistant" as const,
        parts: [{ type: "text" as const, text }],
      },
    ],
    todos: [],
  };
}

describe("useSubtaskPreviewSource", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the published source stable during the throttle window", () => {
    const first = makeSource("first");
    const second = makeSource("second");
    const third = makeSource("third");

    const { result, rerender } = renderHook(
      ({ source }) =>
        useSubtaskPreviewSource(source, {
          isExecuting: true,
          isPreviewVisible: true,
        }),
      { initialProps: { source: first } },
    );

    expect(result.current).toBe(first);

    rerender({ source: second });
    rerender({ source: third });

    expect(result.current).toBe(first);

    act(() => {
      vi.advanceTimersByTime(SubtaskPreviewSourceThrottleMs);
    });

    expect(result.current).toBe(third);
  });

  it("does not schedule a publish when the current source is already published", () => {
    const first = makeSource("first");

    const { result } = renderHook(() =>
      useSubtaskPreviewSource(first, {
        isExecuting: true,
        isPreviewVisible: true,
      }),
    );

    expect(result.current).toBe(first);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("publishes immediately when execution stops", () => {
    const first = makeSource("first");
    const second = makeSource("second");

    const { result, rerender } = renderHook(
      ({ source, isExecuting }) =>
        useSubtaskPreviewSource(source, {
          isExecuting,
          isPreviewVisible: true,
        }),
      { initialProps: { source: first, isExecuting: true } },
    );

    rerender({ source: second, isExecuting: true });
    expect(result.current).toBe(first);

    rerender({ source: second, isExecuting: false });
    expect(result.current).toBe(second);

    act(() => {
      vi.advanceTimersByTime(SubtaskPreviewSourceThrottleMs);
    });

    expect(result.current).toBe(second);
  });

  it("suppresses source updates while disabled and publishes latest when enabled again", () => {
    const first = makeSource("first");
    const second = makeSource("second");
    const third = makeSource("third");

    const { result, rerender } = renderHook(
      ({ source, isPreviewVisible }) =>
        useSubtaskPreviewSource(source, {
          isExecuting: true,
          isPreviewVisible,
        }),
      { initialProps: { source: first, isPreviewVisible: true } },
    );

    expect(result.current).toBe(first);

    rerender({ source: second, isPreviewVisible: false });
    rerender({ source: third, isPreviewVisible: false });

    expect(result.current).toBe(first);

    rerender({ source: third, isPreviewVisible: true });

    expect(result.current).toBe(third);
  });
});
