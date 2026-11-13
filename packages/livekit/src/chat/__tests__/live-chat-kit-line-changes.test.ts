import { Chat } from "@ai-sdk/react";
import { MockLanguageModelV3 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlobStore, LiveKitStore, Message, Task } from "../..";
import { LiveChatKit } from "../live-chat-kit";

const kits: LiveChatKit<Chat<Message>>[] = [];
afterEach(async () => {
  await Promise.all(
    kits.splice(0).map((kit) => kit.backgroundJobManager.dispose()),
  );
});

type LineChanges = { added: number; removed: number };

describe("LiveChatKit line changes", () => {
  it("records the edits of the previous step before the next request", async () => {
    const { kit, lineChangesEvents } = makeFixture({
      editSummaries: [
        { added: 3, removed: 1 },
        { added: 2, removed: 0 },
      ],
    });

    await kit.chat.sendMessage();

    expect(kit.chat.status).toBe("ready");
    expect(lineChangesEvents()).toEqual([{ added: 5, removed: 1 }]);
  });

  it("does not commit when the line changes are unchanged", async () => {
    const { kit, lineChangesEvents } = makeFixture({
      editSummaries: [{ added: 3, removed: 1 }],
      lineChanges: { added: 3, removed: 1 },
    });

    await kit.chat.sendMessage();

    expect(kit.chat.status).toBe("ready");
    expect(lineChangesEvents()).toEqual([]);
  });

  it("does not commit for a task without edits", async () => {
    const { kit, lineChangesEvents } = makeFixture({ editSummaries: [] });

    await kit.chat.sendMessage();

    expect(kit.chat.status).toBe("ready");
    expect(lineChangesEvents()).toEqual([]);
  });
});

function makeFixture({
  editSummaries,
  lineChanges,
}: {
  editSummaries: LineChanges[];
  lineChanges?: LineChanges;
}) {
  const original: Message[] = [
    {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Edit the files" }],
    },
    {
      id: "assistant-1",
      role: "assistant",
      parts: editSummaries.map((editSummary, index) => ({
        type: "tool-applyDiff",
        toolCallId: `apply-${index}`,
        state: "output-available",
        input: { path: `file-${index}.ts`, searchContent: "", replaceContent: "" },
        output: { success: true, _meta: { edit: "", editSummary } },
      })),
    } as Message,
  ];

  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
  const model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "text-1" });
          controller.enqueue({ type: "text-delta", id: "text-1", delta: "Ok" });
          controller.enqueue({ type: "text-end", id: "text-1" });
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage,
          });
          controller.close();
        },
      }),
    }),
  });

  let task = {
    id: "task-1",
    cwd: "/repo",
    title: "Test",
    status: "pending-model",
    lineChanges: lineChanges ?? null,
  } as Task;
  const commit = vi.fn(
    (event: {
      name: string;
      args: { status?: Task["status"]; lineChanges?: LineChanges };
    }) => {
      if (event.args.status) task = { ...task, status: event.args.status };
      if (event.args.lineChanges)
        task = { ...task, lineChanges: event.args.lineChanges };
    },
  );
  const store = {
    storeId: crypto.randomUUID(),
    query: (query: { label?: string }) => {
      if (query.label === "messages")
        return original.map((data) => ({ data: structuredClone(data) }));
      if (query.label === "task") return task;
      return 1;
    },
    subscribe: () => () => {},
    commit,
  } as unknown as LiveKitStore;

  const kit = new LiveChatKit({
    taskId: "task-1",
    store,
    blobStore: {} as BlobStore,
    chatClass: Chat<Message>,
    getters: {
      getLLM: () => ({ type: "vendor", id: "test", getModel: () => model }),
      getEffectiveContextWindow: () => 10_000,
    },
  });
  kits.push(kit);

  return {
    kit,
    lineChangesEvents: () =>
      commit.mock.calls
        .map(([event]) => event)
        .filter((event) => event.name === "v1.updateLineChanges")
        .map((event) => event.args.lineChanges),
  };
}
