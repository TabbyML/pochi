import { Chat } from "@ai-sdk/react";
import {
  type Environment,
  formatters,
  parseEnvironmentInfo,
  prompts,
} from "@getpochi/common";
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

describe("LiveChatKit environment messages", () => {
  it.each(["user", "notification"] as const)(
    "injects environment into a new %s message before checkpoint preparation",
    async (kind) => {
      const {
        kit,
        original,
        environment,
        getEnvironment,
        preparedRequests,
        requests,
      } = makeFixture(true);
      const parts: Message["parts"] =
        kind === "user"
          ? [{ type: "text", text: "Continue" }]
          : [
              {
                type: "data-background-job-notification",
                data: {
                  kind: "command",
                  notificationId: "bgjob-cmd-1:terminal",
                  backgroundJobId: "bgjob-cmd-1",
                  outputFile: "/tmp/output.log",
                  status: "completed",
                  summary: "Command finished",
                  exitCode: 0,
                  finishedAt: 1,
                },
              },
            ];
      await kit.chat.sendMessage({ parts: structuredClone(parts) });

      expect(kit.chat.status).toBe("ready");
      expect(getEnvironment).toHaveBeenCalledTimes(1);
      expect(kit.chat.messages).toHaveLength(original.length + 2);
      expect(kit.chat.messages.slice(0, original.length)).toEqual(original);
      const reminder = {
        type: "text",
        text: prompts.createSystemReminder(
          prompts.environment(environment, undefined),
        ),
      };
      // Checkpoint hooks classify the outgoing message with the reminder
      // already in place, exactly as it is sent and persisted.
      expect(preparedRequests[0].at(-1)?.parts).toEqual([reminder, ...parts]);
      expect(requests[0].at(-1)?.parts).toEqual([
        reminder,
        ...parts,
        { type: "data-checkpoint", data: { commit: "after-tools" } },
      ]);
    },
  );

  it("appends the environment after auto-compaction hides the original snapshot", async () => {
    const {
      kit,
      model,
      original,
      saved,
      environment,
      getEnvironment,
      preparedRequests,
    } = makeFixture(true, true);
    await kit.chat.sendMessage();

    expect(kit.chat.status).toBe("ready");
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(kit.chat.messages).toHaveLength(original.length + 2);
    expect(kit.chat.messages[0]).toEqual(original[0]);
    expect(kit.chat.messages[2].parts[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("<compact>"),
    });
    expect(kit.chat.messages[2].parts.slice(1)).toEqual(original[2].parts);
    expect(kit.chat.messages[3]).toEqual(original[3]);
    const added = kit.chat.messages[original.length];
    expect(added.role).toBe("user");
    expect(preparedRequests[0].at(-1)?.parts).toEqual([
      {
        type: "text",
        text: prompts.createSystemReminder(
          prompts.environment(environment, undefined),
        ),
      },
    ]);
    expect(getEnvironment).toHaveBeenCalledTimes(1);
    expect(saved.get(added.id)).toEqual(added);
    expect(parseEnvironmentInfo(model.doStreamCalls[0].prompt)).toEqual(
      environment.info,
    );
    expect([...saved.values()]).toEqual(kit.chat.messages);
  });

  it.each([false, true])(
    "adds and persists the environment at the tail without changing history (assistant tail: %s)",
    async (assistantTail) => {
      const fixture = makeFixture(assistantTail);
      const {
        kit,
        model,
        original,
        saved,
        environment,
        requests,
        createKit,
        getEnvironment,
      } = fixture;
      await kit.chat.sendMessage();

      expect(kit.chat.status).toBe("ready");
      expect(getEnvironment).toHaveBeenCalledTimes(1);
      // A user tail is a retried message: the reminder joins it instead of
      // following it as another user message.
      const kept = assistantTail ? original.length : original.length - 1;
      expect(kit.chat.messages.slice(0, kept)).toEqual(original.slice(0, kept));
      expect([...saved.values()].slice(0, kept)).toEqual(
        original.slice(0, kept),
      );
      expect(kit.chat.messages).toHaveLength(kept + 2);
      const environmentMessage = kit.chat.messages[kept];
      expect(environmentMessage.role).toBe("user");
      const reminder = {
        type: "text",
        text: prompts.createSystemReminder(
          prompts.environment(environment, undefined),
        ),
      };
      expect(
        environmentMessage.parts.filter((part) => part.type === "text"),
      ).toEqual(
        assistantTail ? [reminder] : [...original[kept].parts, reminder],
      );
      expect(environmentMessage.parts).toContainEqual({
        type: "data-checkpoint",
        data: { commit: "after-tools" },
      });
      expect(saved.get(environmentMessage.id)).toEqual(environmentMessage);
      expect(
        formatters
          .ui(kit.chat.messages)
          .some(({ id }) => id === environmentMessage.id),
      ).toBe(!assistantTail);
      const response = kit.chat.messages.at(-1)!;
      expect(response.role).toBe("assistant");
      expect(
        response.parts.filter((part) => part.type.startsWith("tool-")),
      ).toEqual([]);
      expect(original.some(({ id }) => id === response.id)).toBe(false);
      const prompt = model.doStreamCalls[0].prompt;
      expect(parseEnvironmentInfo(prompt)).toEqual(environment.info);
      if (assistantTail)
        expect(prompt.some(({ role }) => role === "tool")).toBe(true);

      // A regenerated response uses exactly the already-persisted environment.
      environment.currentTime = "2030-01-01";
      await kit.chat.regenerate();
      expect(kit.chat.status).toBe("ready");
      expect(model.doStreamCalls[1].prompt).toEqual(prompt);
      expect(requests[1]).toEqual(requests[0]);

      // Reload from the last persisted request to model retrying after a crash.
      saved.clear();
      for (const message of requests[0])
        saved.set(message.id, structuredClone(message));
      const reloaded = createKit();
      await reloaded.chat.sendMessage();
      expect(reloaded.chat.status).toBe("ready");
      expect(model.doStreamCalls[2].prompt).toEqual(prompt);
      expect(requests[2]).toEqual(requests[0]);

      await reloaded.chat.sendMessage({ text: "Next question" });
      expect(reloaded.chat.status).toBe("ready");
      expect(model.doStreamCalls[3].prompt.slice(0, prompt.length)).toEqual(
        prompt,
      );
      expect(reloaded.chat.messages.slice(0, kept)).toEqual(
        original.slice(0, kept),
      );
      const nextUser = requests[3].at(-1)!;
      expect(
        nextUser.parts.some(
          (part) =>
            part.type === "text" && part.text.includes("# System Information"),
        ),
      ).toBe(false);
      expect(
        nextUser.parts.some(
          (part) => part.type === "text" && part.text.includes("# GIT STATUS"),
        ),
      ).toBe(true);
      expect(getEnvironment).toHaveBeenCalledTimes(4);
    },
  );

  it("appends no message until the complete environment is available", async () => {
    const { kit, original, environment, getEnvironment, preparedRequests } =
      makeFixture(true);
    let resolveEnvironment!: (value: Environment) => void;
    getEnvironment.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveEnvironment = resolve;
        }),
    );

    const request = kit.chat.sendMessage();
    await vi.waitFor(() => expect(getEnvironment).toHaveBeenCalledTimes(1));
    expect(kit.chat.messages).toEqual(original);
    expect(preparedRequests).toHaveLength(0);

    resolveEnvironment(environment);
    await request;
    expect(kit.chat.status).toBe("ready");
    expect(getEnvironment).toHaveBeenCalledTimes(1);
    expect(kit.chat.messages[original.length].parts).toEqual([
      {
        type: "text",
        text: prompts.createSystemReminder(
          prompts.environment(environment, undefined),
        ),
      },
      { type: "data-checkpoint", data: { commit: "after-tools" } },
    ]);
  });

  it.each(["environment", "persistence"] as const)(
    "retries a %s failure without empty or duplicate reminders",
    async (failure) => {
      const { kit, model, original, saved, failNextRequest, getEnvironment } =
        makeFixture(true);
      failNextRequest(failure);
      await kit.chat.sendMessage();
      expect(kit.chat.status).toBe("error");
      expect(model.doStreamCalls).toHaveLength(0);
      // Checkpoint hooks still run when only the environment failed to load.
      expect(
        withoutCheckpoints(kit.chat.messages.slice(0, original.length)),
      ).toEqual(original);
      expect(
        withoutCheckpoints([...saved.values()].slice(0, original.length)),
      ).toEqual(original);
      expect(getEnvironment).toHaveBeenCalledTimes(1);
      const pendingMessage = kit.chat.messages[original.length];
      if (failure === "environment") {
        expect(kit.chat.messages).toHaveLength(original.length);
      } else {
        expect(pendingMessage.parts[0]).toMatchObject({
          type: "text",
          text: expect.stringContaining(
            "<system-reminder># System Information",
          ),
        });
      }

      await kit.chat.sendMessage();
      expect(kit.chat.status).toBe("ready");
      expect(model.doStreamCalls).toHaveLength(1);
      expect(kit.chat.messages).toHaveLength(original.length + 2);
      const environmentMessage = kit.chat.messages[original.length];
      if (pendingMessage) expect(environmentMessage.id).toBe(pendingMessage.id);
      expect(saved.get(environmentMessage.id)).toEqual(environmentMessage);
      expect(getEnvironment).toHaveBeenCalledTimes(2);
      expect(
        withoutCheckpoints(kit.chat.messages.slice(0, original.length)),
      ).toEqual(original);
    },
  );
});

function withoutCheckpoints(messages: Message[]): Message[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.filter((part) => part.type !== "data-checkpoint"),
  }));
}

function makeFixture(assistantTail: boolean, autoCompact = false) {
  const environment: Environment = {
    currentTime: "2026-10-16",
    workspace: {},
    info: { os: "darwin", shell: "zsh", homedir: "/Users/test", cwd: "/repo" },
  };
  const original: Message[] = [
    {
      id: "first-user",
      role: "user",
      parts: [
        {
          type: "text",
          text: prompts.createSystemReminder(
            prompts.environment(environment, undefined),
          ),
        },
      ],
    },
    {
      id: "first-assistant",
      role: "assistant",
      parts: [{ type: "text", text: "Done" }],
    },
    {
      id: "compacted-user",
      role: "user",
      parts: [
        ...(autoCompact
          ? []
          : [
              {
                type: "text" as const,
                text: "<compact>Previous conversation summary</compact>",
              },
            ]),
        {
          type: "text",
          text: prompts.createSystemReminder("# GIT STATUS\nOld status"),
        },
        { type: "text", text: prompts.customAgentSystemReminder("demo") },
        { type: "text", text: "Inspect README.md" },
      ],
    },
  ];
  if (assistantTail)
    original.push({
      id: "tool-assistant",
      role: "assistant",
      parts: [
        {
          type: "tool-readFile",
          toolCallId: "read-1",
          state: "output-available",
          input: { path: "README.md" },
          output: { content: "Readme contents" },
        },
      ],
    } as Message);

  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  };
  const model = new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: "text", text: "Summary without system information" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    },
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "text-1" });
          controller.enqueue({
            type: "text-delta",
            id: "text-1",
            delta: "Continuing",
          });
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
  const saved = new Map(
    original.map((message) => [message.id, structuredClone(message)]),
  );
  const requests: Message[][] = [];
  const preparedRequests: Message[][] = [];
  let failure: "environment" | "persistence" | undefined;
  let task = {
    id: "task-1",
    cwd: "/repo",
    background: true,
    title: "Test",
    status: "pending-model",
    totalTokens: autoCompact ? 100_000 : null,
  } as Task;
  const store = {
    storeId: crypto.randomUUID(),
    query: (query: { label?: string }) => {
      if (query.label === "messages")
        return [...saved.values()].map((data) => ({
          data: structuredClone(data),
        }));
      if (query.label === "task") return task;
      return 1;
    },
    subscribe: () => () => {},
    commit: vi.fn(
      (event: {
        name: string;
        args: {
          data?: Message;
          status?: Task["status"];
          id?: string;
          text?: string;
        };
      }) => {
        if (
          event.name === "v1.ChatStreamStarted" &&
          failure === "persistence"
        ) {
          failure = undefined;
          throw new Error("Persistence failed");
        }
        // These existing events persist only their single data message.
        if (
          [
            "v1.ChatStreamStarted",
            "v1.ChatStreamFinished",
            "v1.ChatStreamFailed",
          ].includes(event.name) &&
          event.args.data
        ) {
          saved.set(event.args.data.id, structuredClone(event.args.data));
        }
        if (event.name === "v1.InlineCompactAttached") {
          const message = saved.get(event.args.id!)!;
          message.parts.unshift({ type: "text", text: event.args.text! });
        }
        if (event.args.status) task = { ...task, status: event.args.status };
      },
    ),
  } as unknown as LiveKitStore;
  const getEnvironment = vi.fn(async () => {
    if (failure === "environment") {
      failure = undefined;
      throw new Error("Environment failed");
    }
    return environment;
  });
  const createKit = () => {
    const kit = new LiveChatKit({
      taskId: "task-1",
      store,
      blobStore: {} as BlobStore,
      chatClass: Chat<Message>,
      enableAutoCompact: autoCompact,
      getters: {
        getLLM: () => ({ type: "vendor", id: "test", getModel: () => model }),
        getEffectiveContextWindow: () => 10_000,
        getEnvironment,
      },
      onOverrideMessages: async ({ messages }) => {
        preparedRequests.push(structuredClone(messages));
        const last = messages.at(-1)!;
        if (!last.parts.some((part) => part.type === "data-checkpoint")) {
          last.parts.push({
            type: "data-checkpoint",
            data: { commit: "after-tools" },
          });
        }
      },
      onStreamStart: ({ messages }) => {
        requests.push(structuredClone(messages));
      },
    });
    kits.push(kit);
    return kit;
  };
  return {
    kit: createKit(),
    createKit,
    model,
    saved,
    original,
    environment,
    getEnvironment,
    requests,
    preparedRequests,
    failNextRequest: (value: typeof failure) => {
      failure = value;
    },
  };
}
