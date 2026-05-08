// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolCallStatusRegistry } from "../fixed-state";

const toolCall = {
  toolName: "executeCommand",
  toolCallId: "tool-call-1",
};

function streamingOutput(content: string) {
  return {
    toolName: "executeCommand" as const,
    output: {
      content,
      status: "running" as const,
      isTruncated: false,
    },
  };
}

async function flushEmittery() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("ToolCallStatusRegistry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throttles streaming updates while keeping the latest value", async () => {
    const registry = new ToolCallStatusRegistry({ streamingThrottleMs: 100 });
    const onUpdated = vi.fn();
    registry.on("updated", onUpdated);

    registry.set(toolCall, { isExecuting: true });
    await flushEmittery();

    expect(onUpdated).toHaveBeenCalledTimes(1);

    registry.set(toolCall, {
      isExecuting: true,
      streamingResult: streamingOutput("first"),
    });
    registry.set(toolCall, {
      isExecuting: true,
      streamingResult: streamingOutput("second"),
    });
    await flushEmittery();

    expect(onUpdated).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(99);
    await flushEmittery();
    expect(onUpdated).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await flushEmittery();
    expect(onUpdated).toHaveBeenCalledTimes(2);
    expect([...registry.entries()][0]?.[1].streamingResult).toEqual(
      streamingOutput("second"),
    );
  });

  it("flushes a pending streaming update when execution finishes", async () => {
    const registry = new ToolCallStatusRegistry({ streamingThrottleMs: 100 });
    const onUpdated = vi.fn();
    registry.on("updated", onUpdated);

    registry.set(toolCall, { isExecuting: true });
    registry.set(toolCall, {
      isExecuting: true,
      streamingResult: streamingOutput("latest"),
    });
    await flushEmittery();

    expect(onUpdated).toHaveBeenCalledTimes(1);

    registry.set(toolCall, { isExecuting: false });
    await flushEmittery();

    expect(onUpdated).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(100);
    await flushEmittery();
    expect(onUpdated).toHaveBeenCalledTimes(2);
  });
});
