import type { Message } from "@getpochi/livekit";
import { describe, expect, it } from "vitest";
import { getRenderWidgetError } from "../use-render-widget-error";

describe("getRenderWidgetError", () => {
  it("returns the latest renderWidget error kind", () => {
    const messages = [
      createAssistantMessage([
        createRenderWidgetPart({
          toolCallId: "widget-1",
          title: "Weather widget",
        }),
      ]),
    ];

    const errorKind = getRenderWidgetError(messages, (toolCallId) =>
      toolCallId === "widget-1"
        ? { kind: "internal", message: "window.pochi.state is invalid" }
        : undefined,
    );

    expect(errorKind).toBe("internal");
  });

  it("prefers internal errors when multiple latest renderWidget parts fail", () => {
    const messages = [
      createAssistantMessage([
        createRenderWidgetPart({
          toolCallId: "widget-runtime",
          title: "Runtime widget",
        }),
        createRenderWidgetPart({
          toolCallId: "widget-internal",
          title: "Internal widget",
        }),
      ]),
    ];

    const errorKind = getRenderWidgetError(messages, (toolCallId) =>
      toolCallId === "widget-internal"
        ? { kind: "internal", message: "missing pochi-widget" }
        : { kind: "runtime", message: "boom" },
    );

    expect(errorKind).toBe("internal");
  });

  it("ignores renderWidget errors outside the latest assistant message", () => {
    const messages = [
      createAssistantMessage([
        createRenderWidgetPart({
          toolCallId: "widget-1",
          title: "Old widget",
        }),
      ]),
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "continue" }],
      } as Message,
    ];

    const errorKind = getRenderWidgetError(messages, () => ({
      kind: "runtime",
      message: "still broken",
    }));

    expect(errorKind).toBeUndefined();
  });
});

function createAssistantMessage(parts: Message["parts"]): Message {
  return {
    id: "assistant-1",
    role: "assistant",
    parts,
  } as Message;
}

function createRenderWidgetPart({
  toolCallId,
  title,
}: {
  toolCallId: string;
  title: string;
}): Message["parts"][number] {
  return {
    type: "tool-renderWidget",
    toolCallId,
    state: "output-available",
    input: {
      title,
      widgetCode: "<pochi-widget state='{}'></pochi-widget>",
      guidelinesRead: true,
    },
    output: { state: {} },
  } as Message["parts"][number];
}
