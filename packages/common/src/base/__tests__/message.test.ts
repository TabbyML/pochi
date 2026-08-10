import { describe, expect, it } from "vitest";
import { MessageMetadata } from "../message";

describe("MessageMetadata", () => {
  it("preserves assistant input and cache-read token usage", () => {
    const metadata = MessageMetadata.parse({
      kind: "assistant",
      totalTokens: 12,
      inputTokens: 0,
      cacheReadTokens: 0,
      finishReason: "stop",
    });

    expect(metadata).toMatchObject({
      inputTokens: 0,
      cacheReadTokens: 0,
    });
  });
});
