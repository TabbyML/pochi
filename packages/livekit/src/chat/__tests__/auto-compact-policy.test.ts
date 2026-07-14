import { constants } from "@getpochi/common";
import { describe, expect, it } from "vitest";
import type { Message, RequestData, Task } from "../../types";
import {
  AutoCompactBufferTokens,
  DefaultEffectiveContextWindow,
  MaxSummaryOutputTokens,
  findAutoCompactAttachIndex,
  getAutoCompactThreshold,
  shouldAutoCompact,
} from "../auto-compact-policy";

function userMessage(
  text = "next question",
  extra: Partial<Message> = {},
): Message {
  return {
    id: "u-last",
    role: "user",
    parts: [{ type: "text", text }],
    ...extra,
  } as unknown as Message;
}

function assistantMessage(text = "previous answer"): Message {
  return {
    id: "a-prev",
    role: "assistant",
    parts: [{ type: "text", text }],
  } as unknown as Message;
}

function assistantToolMessage(
  state: "input-available" | "output-available" | "output-error",
): Message {
  return {
    id: "a-tool",
    role: "assistant",
    parts: [
      {
        type: "tool-readFile",
        toolCallId: "tool-1",
        state,
        input: { path: "foo.ts" },
        output:
          state === "input-available" ? undefined : { output: "result text" },
      },
    ],
  } as unknown as Message;
}

function task(totalTokens: number | undefined): Task {
  return { totalTokens } as unknown as Task;
}

const openaiLlm = (contextWindow: number): RequestData["llm"] =>
  ({
    id: "test-model",
    type: "openai",
    modelId: "test",
    contextWindow,
    maxOutputTokens: 4096,
  }) as RequestData["llm"];

describe("getAutoCompactThreshold", () => {
  it("caps large declared windows at DefaultEffectiveContextWindow", () => {
    expect(getAutoCompactThreshold(1_000_000)).toBe(
      DefaultEffectiveContextWindow -
        MaxSummaryOutputTokens -
        AutoCompactBufferTokens,
    );
  });

  it("subtracts summary reserve + buffer when the context window is smaller than the effective cap", () => {
    expect(getAutoCompactThreshold(100_000)).toBe(
      100_000 - MaxSummaryOutputTokens - AutoCompactBufferTokens,
    );
    expect(getAutoCompactThreshold(40_000)).toBe(
      40_000 - MaxSummaryOutputTokens - AutoCompactBufferTokens,
    );
  });

  it("uses an explicit effectiveContextWindow instead of the default cap", () => {
    expect(getAutoCompactThreshold(1_000_000, 400_000)).toBe(
      400_000 - MaxSummaryOutputTokens - AutoCompactBufferTokens,
    );
    expect(getAutoCompactThreshold(1_000_000, 100_000)).toBe(
      100_000 - MaxSummaryOutputTokens - AutoCompactBufferTokens,
    );
  });

  it("never lets effectiveContextWindow exceed the declared window", () => {
    expect(getAutoCompactThreshold(100_000, 400_000)).toBe(
      100_000 - MaxSummaryOutputTokens - AutoCompactBufferTokens,
    );
  });

  it("never returns a negative threshold for tiny windows", () => {
    expect(getAutoCompactThreshold(5_000)).toBe(0);
    expect(getAutoCompactThreshold(0)).toBe(0);
  });
});

describe("shouldAutoCompact", () => {
  const minTokens = constants.CompactTaskMinTokens;
  const contextWindow =
    minTokens + MaxSummaryOutputTokens + AutoCompactBufferTokens;

  it("triggers once total tokens reach the buffer-based threshold", () => {
    const messages = [assistantMessage(), userMessage()];
    expect(
      shouldAutoCompact({
        messages,
        llm: openaiLlm(contextWindow),
        task: task(getAutoCompactThreshold(contextWindow)),
      }),
    ).toBe(true);
  });

  it("does not trigger when total tokens are below the floor", () => {
    const messages = [assistantMessage(), userMessage()];
    expect(
      shouldAutoCompact({
        messages,
        llm: openaiLlm(contextWindow),
        task: task(minTokens - 1),
      }),
    ).toBe(false);
  });

  it("does not trigger when the last message is not from the user", () => {
    const messages = [userMessage(), assistantMessage()];
    expect(
      shouldAutoCompact({
        messages,
        llm: openaiLlm(contextWindow),
        task: task(contextWindow),
      }),
    ).toBe(false);
  });

  it("triggers after a completed assistant tool result", () => {
    const messages = [
      userMessage("initial", { id: "u-0" } as Partial<Message>),
      assistantMessage(),
      userMessage("continue", { id: "u-1" } as Partial<Message>),
      assistantToolMessage("output-available"),
    ];
    expect(
      shouldAutoCompact({
        messages,
        llm: openaiLlm(contextWindow),
        task: task(getAutoCompactThreshold(contextWindow)),
      }),
    ).toBe(true);
  });

  it("does not trigger while assistant tool calls are still pending", () => {
    const messages = [userMessage(), assistantToolMessage("input-available")];
    expect(
      shouldAutoCompact({
        messages,
        llm: openaiLlm(contextWindow),
        task: task(contextWindow),
      }),
    ).toBe(false);
  });

  it("falls back to DefaultContextWindow when the LLM has no contextWindow", () => {
    const messages = [assistantMessage(), userMessage()];
    const vendorLlm = {
      id: "vendor-cli",
      type: "vendor",
      getModel: () => ({}) as never,
    } as RequestData["llm"];

    expect(
      shouldAutoCompact({
        messages,
        llm: vendorLlm,
        task: task(getAutoCompactThreshold(constants.DefaultContextWindow)),
      }),
    ).toBe(true);

    expect(
      shouldAutoCompact({
        messages,
        llm: vendorLlm,
        task: task(constants.CompactTaskMinTokens - 1),
      }),
    ).toBe(false);
  });

  it("caps an explicit vendor contextWindow at the default effective window", () => {
    const messages = [assistantMessage(), userMessage()];
    const vendorLlm = {
      id: "vendor-cli",
      type: "vendor",
      contextWindow: 1_000_000,
      getModel: () => ({}) as never,
    } as RequestData["llm"];
    const threshold = getAutoCompactThreshold(1_000_000);

    expect(
      shouldAutoCompact({
        messages,
        llm: vendorLlm,
        task: task(threshold - 1),
      }),
    ).toBe(false);

    expect(
      shouldAutoCompact({
        messages,
        llm: vendorLlm,
        task: task(threshold),
      }),
    ).toBe(true);
  });

  it("respects an explicit effectiveContextWindow on the llm", () => {
    const messages = [assistantMessage(), userMessage()];
    const llm = {
      ...openaiLlm(1_000_000),
      effectiveContextWindow: 100_000,
    } as RequestData["llm"];

    expect(
      shouldAutoCompact({
        messages,
        llm,
        task: task(getAutoCompactThreshold(1_000_000, 100_000)),
      }),
    ).toBe(true);

    expect(
      shouldAutoCompact({
        messages,
        llm,
        task: task(getAutoCompactThreshold(1_000_000, 100_000) - 1),
      }),
    ).toBe(false);
  });

  it("does not trigger when totalTokens is below the effective threshold", () => {
    const messages = [assistantMessage(), userMessage()];
    const llm = {
      ...openaiLlm(1_000_000),
      effectiveContextWindow: 100_000,
    } as RequestData["llm"];
    const threshold = getAutoCompactThreshold(1_000_000, 100_000);

    expect(
      shouldAutoCompact({
        messages,
        llm,
        task: task(threshold - 1),
      }),
    ).toBe(false);
  });

  it("skips the manual compact path (metadata.compact === true)", () => {
    const messages = [
      assistantMessage(),
      userMessage("continue", {
        metadata: { kind: "user", compact: true },
      }) as Message,
    ];
    expect(
      shouldAutoCompact({
        messages,
        llm: openaiLlm(contextWindow),
        task: task(contextWindow),
      }),
    ).toBe(false);
  });

  it("skips when the last user message already carries a <compact> block", () => {
    const messages = [
      assistantMessage(),
      userMessage("<compact>previous summary</compact>"),
    ];
    expect(
      shouldAutoCompact({
        messages,
        llm: openaiLlm(contextWindow),
        task: task(contextWindow),
      }),
    ).toBe(false);
  });

  it("skips when the tool-result tail already carries a <compact> block", () => {
    const messages = [
      assistantMessage(),
      userMessage("<compact>previous summary</compact>"),
      assistantToolMessage("output-available"),
    ];
    expect(
      shouldAutoCompact({
        messages,
        llm: openaiLlm(contextWindow),
        task: task(contextWindow),
      }),
    ).toBe(false);
  });

  it("uses estimated total tokens when task token metadata is stale", () => {
    const messages = [assistantMessage(), userMessage()];
    expect(
      shouldAutoCompact({
        messages,
        llm: openaiLlm(contextWindow),
        task: task(constants.CompactTaskMinTokens - 1),
        estimatedTotalTokens: getAutoCompactThreshold(contextWindow),
      }),
    ).toBe(true);
  });

  it("returns false when there are no messages", () => {
    expect(
      shouldAutoCompact({
        messages: [],
        llm: openaiLlm(contextWindow),
        task: task(contextWindow),
      }),
    ).toBe(false);
  });

  it("returns false when task is missing", () => {
    const messages = [assistantMessage(), userMessage()];
    expect(
      shouldAutoCompact({
        messages,
        llm: openaiLlm(contextWindow),
        task: null,
      }),
    ).toBe(false);
  });
});

describe("findAutoCompactAttachIndex", () => {
  it("returns the last message index when the tail is user-authored", () => {
    const messages = [assistantMessage(), userMessage()];
    expect(findAutoCompactAttachIndex(messages)).toBe(1);
  });

  it("returns the previous user index when the tail is a completed tool result", () => {
    const messages = [
      userMessage("initial", { id: "u-0" } as Partial<Message>),
      assistantMessage(),
      userMessage("continue", { id: "u-1" } as Partial<Message>),
      assistantToolMessage("output-available"),
    ];
    expect(findAutoCompactAttachIndex(messages)).toBe(2);
  });

  it("returns undefined for non-tool assistant tails", () => {
    const messages = [userMessage(), assistantMessage()];
    expect(findAutoCompactAttachIndex(messages)).toBeUndefined();
  });
});
