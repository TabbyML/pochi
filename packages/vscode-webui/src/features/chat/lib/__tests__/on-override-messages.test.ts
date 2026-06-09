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

  it("commits non-latest renderWidget output from the latest UI state", async () => {
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

  it("commits renderer errors with the renderWidget output", async () => {
    const messages = [
      createAssistantMessage([
        createRenderWidgetPart({
          toolCallId: "widget-1",
          state: "input-available",
        }),
      ]),
      createUserMessage("continue"),
    ];

    const store = useRenderWidgetStore.getState();
    store.setWidgetState("widget-1", { hex: "#b87528" });
    store.setWidgetError("widget-1", "Widget state must be JSON-serializable.");

    await onOverrideMessages({
      store: {} as never,
      taskId: "task-1",
      messages,
      abortSignal: new AbortController().signal,
    });

    expect(messages[0].parts[0]).toMatchObject({
      state: "output-available",
      output: {
        state: { hex: "#b87528" },
        error: "Widget state must be JSON-serializable.",
      },
    });
    expect(store.getWidgetError("widget-1")).toBeUndefined();
  });

  it("commits an empty renderWidget state when no UI state has been reported", async () => {
    const messages = [
      createAssistantMessage([
        createRenderWidgetPart({
          toolCallId: "widget-1",
          state: "input-available",
        }),
      ]),
      createUserMessage("continue"),
    ];

    await onOverrideMessages({
      store: {} as never,
      taskId: "task-1",
      messages,
      abortSignal: new AbortController().signal,
    });

    expect(messages[0].parts[0]).toMatchObject({
      state: "output-available",
      output: {
        state: {},
      },
    });
  });

  it("commits every input-available renderWidget part outside the latest message", async () => {
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
      state: "output-available",
      output: { state: { hex: "#b87528" } },
    });
    expect(messages[0].parts[1]).toMatchObject({
      state: "output-available",
      output: { state: { city: "beijing" } },
    });
  });

  it("does not commit renderWidget output from older assistant messages", async () => {
    const messages = [
      createAssistantMessage([
        createRenderWidgetPart({
          toolCallId: "widget-old",
          state: "input-available",
        }),
      ]),
      createUserMessage("continue"),
      createAssistantMessage([]),
      createUserMessage("next"),
    ];

    useRenderWidgetStore
      .getState()
      .setWidgetState("widget-old", { city: "beijing" });

    await onOverrideMessages({
      store: {} as never,
      taskId: "task-1",
      messages,
      abortSignal: new AbortController().signal,
    });

    expect(messages[0].parts[0]).toMatchObject({
      state: "input-available",
    });
    expect("output" in messages[0].parts[0]).toBe(false);
  });

  it("does not commit renderWidget output in the latest message", async () => {
    const messages = [
      createUserMessage("show a widget"),
      createAssistantMessage([
        createRenderWidgetPart({
          toolCallId: "widget-latest",
          state: "input-available",
        }),
      ]),
    ];

    useRenderWidgetStore
      .getState()
      .setWidgetState("widget-latest", { city: "beijing" });

    await onOverrideMessages({
      store: {} as never,
      taskId: "task-1",
      messages,
      abortSignal: new AbortController().signal,
    });

    expect(messages[1].parts[0]).toMatchObject({
      state: "input-available",
    });
    expect("output" in messages[1].parts[0]).toBe(false);
  });

  it("overwrites completed renderWidget output with the latest UI state", async () => {
    const messages = [
      createAssistantMessage([
        createRenderWidgetPart({
          toolCallId: "widget-1",
          state: "output-available",
          output: { state: {} },
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
      state: "output-available",
      output: { state: { hex: "#ffffff" } },
    });
  });

  it("does not overwrite renderWidget output-error parts", async () => {
    const existingOutput = { errorText: "failed" };
    const messages = [
      createAssistantMessage([
        createRenderWidgetPart({
          toolCallId: "widget-1",
          state: "output-error",
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
      state: "output-error",
      output: existingOutput,
    });
  });
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
