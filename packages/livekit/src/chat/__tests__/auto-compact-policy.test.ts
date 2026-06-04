import { constants } from "@getpochi/common";
import { describe, expect, it } from "vitest";
import type { Message, RequestData, Task } from "../../types";
import {
  AutoCompactBufferTokens,
  MaxSummaryOutputTokens,
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
  it("subtracts summary reserve + buffer from the context window", () => {
    expect(getAutoCompactThreshold(100_000)).toBe(
      100_000 - MaxSummaryOutputTokens - AutoCompactBufferTokens,
    );
    expect(getAutoCompactThreshold(200_000)).toBe(
      200_000 - MaxSummaryOutputTokens - AutoCompactBufferTokens,
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

  it("uses an explicit vendor contextWindow when one is provided", () => {
    const messages = [assistantMessage(), userMessage()];
    const vendorLlm = {
      id: "vendor-cli",
      type: "vendor",
      contextWindow: 1_000_000,
      getModel: () => ({}) as never,
    } as RequestData["llm"];

    expect(
      shouldAutoCompact({
        messages,
        llm: vendorLlm,
        task: task(constants.CompactTaskMinTokens * 2),
      }),
    ).toBe(false);
  });

  it("does not trigger when totalTokens is below the buffer-based threshold", () => {
    const messages = [assistantMessage(), userMessage()];
    expect(
      shouldAutoCompact({
        messages,
        llm: openaiLlm(1_000_000),
        task: task(minTokens + 1),
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
