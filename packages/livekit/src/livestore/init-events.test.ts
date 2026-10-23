import type { ChatInit } from "ai";
import { Chat } from "@ai-sdk/react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { BlobStore } from "../blob-store";
import type { LiveKitStore, Message } from "../types";
import { LiveChatKit } from "../chat/live-chat-kit";
import { defaultCatalog as catalog } from ".";
import { createForkAgent } from "../background-task/fork-agent";
import { BackgroundJobManager } from "../background-job/manager";
import { makeJobStore } from "../background-job/__tests__/test-store";

describe("history initialization events", () => {
  it("does not reject local initialization based on a message or file size", () => {
    const message = {
      id: "large",
      role: "user" as const,
      parts: [{ type: "text" as const, text: "中文".repeat(180000) }],
    };
    expect(() =>
      catalog.taskInitEvents({
        id: "task",
        createdAt: new Date(),
        initMessages: [message],
      }),
    ).not.toThrow();
    expect(() =>
      catalog.forkTaskInitEvents({
        tasks: [{ id: "task", createdAt: new Date(), status: "completed" }],
        messages: [],
        files: [{ filePath: "/plan.md", content: "中文".repeat(180000) }],
      }),
    ).not.toThrow();
  });
  it("splits even small histories into one message per event", () => {
    const args = {
      id: "task",
      createdAt: new Date(),
      initMessages: ["m1", "m2"].map((id) => ({
        id,
        role: "user" as const,
        parts: [],
      })),
    };
    expect(catalog.taskInitEvents(args)).toEqual([
      catalog.events.taskInited({
        ...args,
        initMessages: [args.initMessages[0]],
      }),
      catalog.events.messageUpserted({
        taskId: args.id,
        data: args.initMessages[1],
      }),
    ]);
  });
  it("initializes a long conversation using one message per event in order", () => {
    const commit = vi.fn();
    const store = {
      storeId: "test",
      commit,
      subscribe: () => () => {},
      query: (q: { label?: string }) =>
        q.label === "messages" ? [] : undefined,
    } as unknown as LiveKitStore;
    const chat = new LiveChatKit({
      store,
      taskId: "task",
      blobStore: {} as BlobStore,
      chatClass: Chat<Message>,
      getters: { getLLM: () => ({ id: "test" }) as never },
    });
    const messages: Message[] = Array.from({ length: 12 }, (_, i) => ({
      id: `message-${i}`,
      role: "user",
      parts: [{ type: "text", text: '中文\\"\n'.repeat(20000) }],
    }));
    chat.init("/workspace", { messages });
    const events = commit.mock.calls.flat();
    expect(events).toHaveLength(messages.length);
    expect(events[0].name).toBe("v1.TaskInited");
    expect(events.slice(1).every((e) => e.name === "v1.MessageUpserted")).toBe(
      true,
    );
    const uploaded = events.flatMap(
      (e) => e.args.initMessages ?? [e.args.data],
    );
    expect(uploaded).toEqual(messages);
    expect(
      events.every(
        (e) => new TextEncoder().encode(JSON.stringify(e)).length < 900000,
      ),
    ).toBe(true);
  });

  it("splits fork messages while retaining task and file metadata", () => {
    const messages = ["m1", "m2", "m3"].map((id) => ({
      id,
      taskId: "task",
      data: {
        id,
        role: "user" as const,
        parts: [{ type: "text" as const, text: "history" }],
      },
    }));
    const events = catalog.forkTaskInitEvents({
      tasks: [{ id: "task", status: "completed", createdAt: new Date() }],
      messages,
      files: [{ filePath: "/plan.md", content: "Plan" }],
    });
    expect(events.map((event) => event.name)).toEqual([
      "v1.ForkTaskInited",
      "v1.MessageUpserted",
      "v1.MessageUpserted",
      "v1.MessageUpserted",
      "v1.ForkTaskInited",
    ]);
    expect(events.slice(1, -1).map((event) => event.args)).toEqual(
      messages.map(({ taskId, data }) => ({ taskId, data })),
    );
    expect(events.at(-1)?.args).toMatchObject({
      files: [{ filePath: "/plan.md", content: "Plan" }],
    });
  });

  it.each(["auto-memory", "auto-memory-dream", "task-memory"] as const)(
    "keeps %s history local and registers the same background task",
    async (label) => {
      const data = makeJobStore();
      const manager = BackgroundJobManager.forStore(data.store);
      const agent = createForkAgent<Message>({
        label,
        parentTaskId: "parent",
        parentCwd: "/repo",
        parentMessages: ["m1", "m2", "m3"].map((id) => ({
          id,
          role: "user",
          parts: [{ type: "text", text: "history".repeat(30000) }],
        })),
        directive: "Extract memory",
        maxSteps: 2,
      });
      try {
        const fork = await manager.startForkAgent(agent);
        const initialization = data.commit.mock.calls[0];
        expect(initialization).toHaveLength(agent.initMessages.length);
        expect(initialization.every((event) => event.name === "v1.ForkAgentLocalEvent")).toBe(true);
        expect(initialization.every((event) => !("useCase" in event.args))).toBe(true);
        expect(initialization.every((event) => catalog.schema.eventsDefsMap.get(event.name)?.options.clientOnly)).toBe(true);
        expect(data.messages.get(fork.taskId)).toEqual(agent.initMessages);
        expect(data.tasks.get(fork.taskId)).toMatchObject({
          background: true,
          status: "pending-model",
        });
        expect(manager.getJobsForTask("parent")).toHaveLength(1);
        // Cancellation without an attached executor must also stay local.
        await manager.kill(`bgjob-task-${fork.taskId}`, "parent");
        expect(data.tasks.get(fork.taskId)?.status).toBe("failed");
        expect(data.commit.mock.calls.flat().every((event) => event.name === "v1.ForkAgentLocalEvent")).toBe(true);
      } finally {
        await manager.dispose();
      }
    },
  );
});

class LifecycleChat {
  messages: Message[];
  readonly status = "ready" as const;
  constructor(readonly options: ChatInit<Message>) {
    this.messages = options.messages ?? [];
  }
  stop = async () => {};
  sendMessage = async () => {};
}

it.each(["auto-memory", "task-memory", "auto-memory-dream"] as const)(
  "keeps %s stream completion, tool outputs and errors local",
  (useCase) => {
    const data = makeJobStore();
    const kit = new LiveChatKit({
      taskId: "fork",
      store: data.store,
      requestUseCase: useCase,
      persistLocallyOnly: true,
      blobStore: {} as BlobStore,
      chatClass: LifecycleChat,
      getters: { getLLM: () => ({ id: "test-model" }) as never },
    });
    kit.init("/repo", { prompt: "Extract memory" });
    const message = {
      id: "answer",
      role: "assistant",
      parts: [],
      metadata: { kind: "assistant", finishReason: "stop", totalTokens: 10 },
    } as unknown as Message;
    kit.chat.messages.push(message);
    kit.chat.options.onFinish?.({
      message,
      messages: kit.chat.messages,
      isAbort: false,
      isDisconnect: false,
      isError: false,
      finishReason: "stop",
    });
    kit.persistToolOutput();
    kit.chat.options.onError?.(new Error("model failed"));
    kit.markAsFailed(new Error("task failed"));
    const committed = data.commit.mock.calls.flat();
    expect(
      committed.every((event) => event.name === "v1.ForkAgentLocalEvent"),
    ).toBe(true);
    expect(committed.map((event) => event.args.name)).toEqual([
      "v1.TaskInited",
      "v1.ChatStreamFinished",
      "v1.ToolsExecutionFinished",
      "v1.ChatStreamFailed",
      "v1.TaskFailed",
    ]);
  },
);

it("keeps request purpose separate from local persistence", () => {
  const data = makeJobStore();
  const kit = new LiveChatKit({
    taskId: "ordinary", store: data.store, requestUseCase: "task-memory",
    blobStore: {} as BlobStore, chatClass: LifecycleChat,
    getters: { getLLM: () => ({ id: "test-model" }) as never },
  });
  kit.init("/repo", { prompt: "hello" });
  expect(data.commit.mock.calls[0][0].name).toBe("v1.TaskInited");
});

it("excludes shared storage events from task-only persistence", () => {
  type TaskEvent = Parameters<typeof catalog.taskEvents>[1][number];
  expectTypeOf<typeof catalog.events.taskInited.Event>().toExtend<TaskEvent>();
  expectTypeOf<
    typeof catalog.events.messageUpserted.Event
  >().toExtend<TaskEvent>();
  expectTypeOf<
    typeof catalog.events.writeStoreFile.Event
  >().not.toExtend<TaskEvent>();
  expectTypeOf<
    typeof catalog.events._writeTaskFile.Event
  >().not.toExtend<TaskEvent>();
  expectTypeOf<
    typeof catalog.events._blobInserted.Event
  >().not.toExtend<TaskEvent>();
  expectTypeOf<
    typeof catalog.events.forkTaskInited.Event
  >().not.toExtend<TaskEvent>();
  expectTypeOf<
    typeof catalog.events.forkAgentLocalEvent.Event
  >().not.toExtend<TaskEvent>();
});

it("rejects nested local envelopes before using the materializer context", () => {
  const materialize = catalog.schema.state.materializers.get(
    "v1.ForkAgentLocalEvent",
  )!;
  expect(() =>
    materialize(
      { name: "v1.ForkAgentLocalEvent", args: {} },
      {} as Parameters<typeof materialize>[1],
    ),
  ).toThrow("Invalid fork agent event: v1.ForkAgentLocalEvent");
});
