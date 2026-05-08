import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import { withMessageCacheBreakpoint } from "../flexible-chat-transport";

const cacheControl = { anthropic: { cacheControl: { type: "ephemeral" } } };

describe("withMessageCacheBreakpoint", () => {
  it("marks the last message by default", () => {
    const messages = [
      modelMessage("first"),
      modelMessage("second"),
      modelMessage("third"),
    ];

    const result = withMessageCacheBreakpoint(messages, "last");

    expect(result[0].providerOptions).toBeUndefined();
    expect(result[1].providerOptions).toBeUndefined();
    expect(result[2].providerOptions).toEqual(cacheControl);
  });

  it("marks the second-to-last message for fork agents", () => {
    const messages = [
      modelMessage("parent user"),
      modelMessage("parent assistant"),
      modelMessage("fork directive"),
    ];

    const result = withMessageCacheBreakpoint(messages, "secondLast");

    expect(result[0].providerOptions).toBeUndefined();
    expect(result[1].providerOptions).toEqual(cacheControl);
    expect(result[2].providerOptions).toBeUndefined();
  });

  it("does not mark a single-message fork agent request", () => {
    const messages = [modelMessage("fork directive")];

    const result = withMessageCacheBreakpoint(messages, "secondLast");

    expect(result[0].providerOptions).toBeUndefined();
  });

  it("preserves existing provider options on the selected message", () => {
    const messages = [
      modelMessage("parent"),
      {
        ...modelMessage("fork directive"),
        providerOptions: { pochi: { taskId: "task-1" } },
      },
    ];

    const result = withMessageCacheBreakpoint(messages, "last");

    expect(result[1].providerOptions).toEqual({
      pochi: { taskId: "task-1" },
      ...cacheControl,
    });
  });
});

function modelMessage(content: string): ModelMessage {
  return {
    role: "user",
    content,
  };
}
