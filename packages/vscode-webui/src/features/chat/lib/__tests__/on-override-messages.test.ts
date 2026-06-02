import type { Message } from "@getpochi/livekit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRenderWidgetStore } from "../../hooks/use-render-widget-store";
import { onOverrideMessages } from "../on-override-messages";

const vscodeHostMock = vi.hoisted(() => ({
  saveCheckpoint: vi.fn(async () => undefined),
  diffWithCheckpoint: vi.fn(),
  readTaskChangedFiles: vi.fn(),
}));

vi.mock("@/lib/vscode", () => ({
  vscodeHost: vscodeHostMock,
}));

describe("onOverrideMessages", () => {
  beforeEach(() => {
    vscodeHostMock.saveCheckpoint.mockClear();
    vscodeHostMock.diffWithCheckpoint.mockClear();
    vscodeHostMock.readTaskChangedFiles.mockClear();
    useRenderWidgetStore.getState().clearAllWidgetStates();
  });

  it("commits the adjacent pending renderWidget output from the latest UI state", async () => {
    const messages = [
      createAssistantMessage([
        createRenderWidgetPart({
          toolCallId: "widget-1",
          state: "input-available",
        }),
      ]),
      createUserMessage("make it transparent"),
    ];

    useRenderWidgetStore
      .getState()
      .setWidgetState("widget-1", { hex: "#b87528" });

    await onOverrideMessages({
      store: {} as never,
      taskId: "task-1",
      messages,
      abortSignal: new AbortController().signal,
    });

    expect(messages[0].parts[0]).toMatchObject({
      state: "output-available",
      output: { state: { hex: "#b87528" } },
    });
    expect(
      useRenderWidgetStore.getState().getWidgetState("widget-1"),
    ).toBeUndefined();
  });

  it("commits only the last pending renderWidget part in the adjacent assistant message", async () => {
    const messages = [
      createAssistantMessage([
        createRenderWidgetPart({
          toolCallId: "widget-1",
          state: "input-available",
        }),
        createRenderWidgetPart({
          toolCallId: "widget-2",
          state: "input-available",
        }),
      ]),
      createUserMessage("show more detail"),
    ];
    const store = useRenderWidgetStore.getState();
    store.setWidgetState("widget-1", { hex: "#b87528" });
    store.setWidgetState("widget-2", { city: "beijing" });

    await onOverrideMessages({
      store: {} as never,
      taskId: "task-1",
      messages,
      abortSignal: new AbortController().signal,
    });

    expect(messages[0].parts[0]).toMatchObject({
      state: "input-available",
    });
    expect(messages[0].parts[1]).toMatchObject({
      state: "output-available",
      output: { state: { city: "beijing" } },
    });
  });

  it.each(["output-available", "output-error"] as const)(
    "does not overwrite renderWidget output in %s state",
    async (state) => {
      const existingOutput =
        state === "output-available"
          ? { state: { hex: "#b87528" } }
          : { errorText: "failed" };
      const messages = [
        createAssistantMessage([
          createRenderWidgetPart({
            toolCallId: "widget-1",
            state,
            output: existingOutput,
          }),
        ]),
        createUserMessage("continue"),
      ];

      useRenderWidgetStore
        .getState()
        .setWidgetState("widget-1", { hex: "#ffffff" });

      await onOverrideMessages({
        store: {} as never,
        taskId: "task-1",
        messages,
        abortSignal: new AbortController().signal,
      });

      expect(messages[0].parts[0]).toMatchObject({
        state,
        output: existingOutput,
      });
    },
  );
});

function createAssistantMessage(parts: Message["parts"]): Message {
  return {
    id: "assistant-1",
    role: "assistant",
    parts,
  } as Message;
}

function createUserMessage(text: string): Message {
  return {
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text }],
  } as Message;
}

function createRenderWidgetPart({
  toolCallId,
  state,
  output,
}: {
  toolCallId: string;
  state: "input-available" | "output-available" | "output-error";
  output?: unknown;
}): Message["parts"][number] {
  return {
    type: "tool-renderWidget",
    toolCallId,
    state,
    input: {
      title: "Color picker",
      widgetCode: "<pochi-widget state='{}'></pochi-widget>",
      guidelinesRead: true,
    },
    ...(output === undefined ? {} : { output }),
  } as Message["parts"][number];
}
