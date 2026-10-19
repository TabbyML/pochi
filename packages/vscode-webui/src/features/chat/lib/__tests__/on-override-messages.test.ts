import type { Message } from "@getpochi/livekit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRenderWidgetStore } from "../../hooks/use-render-widget-store";
import { onOverrideMessages } from "../on-override-messages";

const vscodeHostMock = vi.hoisted(() => ({
  saveCheckpoint: vi.fn<() => Promise<string | undefined>>(),
  diffWithCheckpoint: vi.fn(),
  readTaskChangedFiles: vi.fn(),
}));

vi.mock("@/lib/vscode", () => ({
  vscodeHost: vscodeHostMock,
}));

describe("onOverrideMessages", () => {
  beforeEach(() => {
    vscodeHostMock.saveCheckpoint.mockReset();
    vscodeHostMock.diffWithCheckpoint.mockReset();
    vscodeHostMock.readTaskChangedFiles.mockReset();
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

  describe("changed file summary", () => {
    const updateChangedFiles = vi.fn();
    const baseline: Message = {
      id: "baseline",
      role: "user",
      parts: [{ type: "data-checkpoint", data: { commit: "before-edit" } }],
    };

    beforeEach(() => {
      updateChangedFiles.mockReset();
      vscodeHostMock.saveCheckpoint.mockResolvedValue("after-edit");
      vscodeHostMock.diffWithCheckpoint.mockResolvedValue([]);
      vscodeHostMock.readTaskChangedFiles.mockResolvedValue({
        updateChangedFiles,
      });
    });

    async function override(messages: Message[]) {
      await onOverrideMessages({
        store: { query: () => undefined } as never,
        taskId: "task-1",
        messages,
        abortSignal: new AbortController().signal,
      });
    }

    it("continues to update edits from a final assistant message", async () => {
      const assistant = createAssistantMessage([createFileEditPart()]);

      await override([baseline, assistant]);

      expect(updateChangedFiles).toHaveBeenCalledExactlyOnceWith(
        ["src/a.ts"],
        "before-edit",
      );
      expect(vscodeHostMock.saveCheckpoint).toHaveBeenCalledWith(
        "ckpt-msg-assistant-1",
        { force: false },
      );
    });

    it.each([
      "tool-applyDiff",
      "tool-multiApplyDiff",
      "tool-writeToFile",
    ] as const)("updates %s edits followed by a pure notification", async (type) => {
      const assistant = createAssistantMessage([createFileEditPart(type)]);
      const notification = createNotificationMessage();
      const messages = [baseline, assistant, notification];

      await override(messages);

      expect(vscodeHostMock.readTaskChangedFiles).toHaveBeenCalledWith("task-1");
      expect(updateChangedFiles).toHaveBeenCalledExactlyOnceWith(
        ["src/a.ts"],
        "before-edit",
      );
      expect(vscodeHostMock.saveCheckpoint).toHaveBeenCalledWith(
        "ckpt-msg-notification-1",
        { force: true },
      );
      expect(notification.parts.at(-1)).toEqual({
        type: "data-checkpoint",
        data: { commit: "after-edit" },
      });
      expect(assistant.parts).toHaveLength(1);

      await override(messages);

      expect(vscodeHostMock.saveCheckpoint).toHaveBeenCalledTimes(1);
      expect(updateChangedFiles).toHaveBeenCalledTimes(1);
    });

    it("only includes completed edits after the latest existing checkpoint", async () => {
      const assistant = createAssistantMessage([
        createFileEditPart("tool-applyDiff", "old.ts"),
        { type: "data-checkpoint", data: { commit: "latest-before-edit" } },
        { type: "step-start" },
        createFileEditPart(),
        createFileEditPart("tool-multiApplyDiff"),
        {
          type: "tool-writeToFile",
          toolCallId: "pending-edit",
          state: "input-available",
          input: { path: "pending.ts", content: "after" },
        },
      ]);

      await override([baseline, assistant, createNotificationMessage()]);

      expect(updateChangedFiles).toHaveBeenCalledExactlyOnceWith(
        ["src/a.ts"],
        "latest-before-edit",
      );
    });

    it("does not add edits from before a checkpoint back to the summary", async () => {
      const assistant = createAssistantMessage([
        createFileEditPart(),
        { type: "data-checkpoint", data: { commit: "already-tracked" } },
      ]);

      await override([baseline, assistant, createNotificationMessage()]);

      expect(updateChangedFiles).toHaveBeenCalledExactlyOnceWith(
        [],
        "already-tracked",
      );
    });

    it.each(["text", "text with notification", "empty"])(
      "does not process the preceding assistant when user input is %s",
      async (kind) => {
        const user = createUserMessage("continue");
        if (kind === "text with notification") {
          user.parts.push(...createNotificationMessage().parts);
        } else if (kind === "empty") {
          user.parts = [];
        }

        await override([
          baseline,
          createAssistantMessage([createFileEditPart()]),
          user,
        ]);

        expect(updateChangedFiles).not.toHaveBeenCalled();
      },
    );

    it("does not look past an intervening user message for edits", async () => {
      await override([
        baseline,
        createAssistantMessage([createFileEditPart()]),
        createUserMessage("continue"),
        createNotificationMessage(),
      ]);

      expect(updateChangedFiles).not.toHaveBeenCalled();
    });

    it("requires a newly saved checkpoint before updating the summary", async () => {
      vscodeHostMock.saveCheckpoint.mockResolvedValue(undefined);

      await override([
        baseline,
        createAssistantMessage([createFileEditPart()]),
        createNotificationMessage(),
      ]);

      expect(updateChangedFiles).not.toHaveBeenCalled();
    });

    it("requires an existing checkpoint to use as the edit baseline", async () => {
      await override([
        createAssistantMessage([createFileEditPart()]),
        createNotificationMessage(),
      ]);

      expect(updateChangedFiles).not.toHaveBeenCalled();
    });
  });
});

function createNotificationMessage(): Message {
  return {
    id: "notification-1",
    role: "user",
    parts: [
      {
        type: "data-background-job-notification",
        data: {
          notificationId: "notification-1",
          backgroundJobId: "job-1",
          kind: "command",
          status: "completed",
          finishedAt: 1,
          outputFile: "output.txt",
          summary: "Command completed",
          exitCode: 0,
        },
      },
    ],
  };
}

function createFileEditPart(
  type: "tool-applyDiff" | "tool-multiApplyDiff" | "tool-writeToFile" = "tool-applyDiff",
  path = "src/a.ts",
): Message["parts"][number] {
  const edit = { searchContent: "before", replaceContent: "after" };
  const input =
    type === "tool-writeToFile"
      ? { path, content: "after" }
      : type === "tool-multiApplyDiff"
        ? { path, edits: [edit] }
        : { path, ...edit };
  return {
    type,
    toolCallId: `${type}-${path}`,
    state: "output-available",
    input,
    output: { success: true },
  } as Message["parts"][number];
}

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
