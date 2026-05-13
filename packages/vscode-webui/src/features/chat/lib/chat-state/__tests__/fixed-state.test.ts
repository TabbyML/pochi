// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
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
  it("emits an update for every status change", async () => {
    const registry = new ToolCallStatusRegistry();
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

    expect(onUpdated).toHaveBeenCalledTimes(3);
    expect([...registry.entries()][0]?.[1].streamingResult).toEqual(
      streamingOutput("second"),
    );

    registry.delete(toolCall);
    await flushEmittery();
    expect(onUpdated).toHaveBeenCalledTimes(4);
  });
});
