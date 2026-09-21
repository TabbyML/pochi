import { createTestCliAdaptor } from "./cli-adaptor";
import {
  BackgroundJobManager,
  type Message,
  type Task,
} from "@getpochi/livekit";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeToolCall as executeCliToolCall } from "../../tools";
import type { ToolCallOptions } from "../../types";
import { describe, expect, it, vi } from "vitest";
import { makeJobStore } from "@getpochi/livekit/testing";
import { TaskRunner } from "../../task-runner";

describe("CLI background job shutdown", () => {
  it.each([0, 60_000])(
    "releases the run with async wait %s when finishing or aborted",
    async (timeoutMs) => {
      const { store, tasks, messages } = makeJobStore();
      tasks.set("parent", {
        id: "parent",
        cwd: "/repo",
        status: "completed",
        parentId: null,
        background: false,
      } as Task);
      tasks.set("child", {
        id: "child",
        cwd: "/repo",
        status: "pending-tool",
        parentId: "parent",
        background: true,
      } as Task);
      messages.set("parent", [
        {
          id: "parent-result",
          role: "assistant",
          parts: [
            {
              type: "tool-attemptCompletion",
              toolCallId: "done",
              state: "input-available",
              input: { result: "Done" },
            },
          ],
          metadata: { kind: "assistant", finishReason: "stop" },
        },
      ] as Message[]);
      messages.set("child", [
        {
          id: "child-tools",
          role: "assistant",
          parts: [
            {
              type: "tool-readFile",
              toolCallId: "read",
              state: "input-available",
              input: { path: "a.txt" },
            },
          ],
          metadata: { kind: "assistant", finishReason: "stop" },
        },
      ] as Message[]);
      const controller = new AbortController();
      let started!: () => void;
      const toolStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      const executeToolCall = vi.fn(
        async ({ abortSignal }: { abortSignal: AbortSignal }) => {
          started();
          return new Promise((resolve) => {
            const done = () => resolve({ error: "aborted" });
            if (abortSignal.aborted) done();
            else abortSignal.addEventListener("abort", done, { once: true });
          });
        },
      );
      const adaptor = createTestCliAdaptor({ store });
      vi.spyOn(adaptor, "executeToolCall").mockImplementation(executeToolCall);
      const runner = new TaskRunner({
        adaptor,
        uid: "parent",
        cwd: "/repo",
        store,
        blobStore: {} as never,
        llm: { id: "test" } as never,
        filesystem: {} as never,
        rg: "rg",
        maxSteps: 24,
        maxRetries: 3,
        abortSignal: controller.signal,
        asyncWaitTimeoutInMs: timeoutMs,
      });
      let settled = false;
      const run = runner.run().then(() => {
        settled = true;
      });
      try {
        if (timeoutMs > 0) {
          await toolStarted;
          controller.abort();
        }
        await vi.waitFor(() => expect(settled).toBe(true), { timeout: 1000 });
        await run;
      } finally {
        controller.abort();
        await run;
      }
    },
  );
});

describe("CLI monitor finalization", () => {
  async function setup(asyncWaitTimeoutInMs: number) {
    const commandOutputDir = await mkdtemp(
      join(tmpdir(), "pochi-monitor-wait-"),
    );
    const { store, tasks } = makeJobStore();
    tasks.set("parent", {
      id: "parent",
      cwd: process.cwd(),
      status: "completed",
      parentId: null,
      background: false,
    } as Task);
    const adaptor = createTestCliAdaptor({ store, commandOutputDir });
    const manager = BackgroundJobManager.forStore(store);
    const controller = new AbortController();
    const runner = new TaskRunner({
      adaptor,
      store,
      uid: "parent",
      cwd: process.cwd(),
      blobStore: {} as never,
      llm: { id: "test" } as never,
      filesystem: {} as never,
      rg: "rg",
      maxSteps: 24,
      maxRetries: 3,
      asyncWaitTimeoutInMs,
      abortSignal: controller.signal,
    });
    const internals = runner as unknown as {
      waitForAsyncWork(): Promise<boolean>;
      step(): Promise<"finished" | "next" | "retry">;
      chat: { messages: Message[] };
    };
    // The task already exists, so initialize its conversation explicitly.
    internals.chat.messages = [
      {
        id: "result",
        role: "assistant",
        parts: [
          {
            type: "tool-attemptCompletion",
            toolCallId: "done",
            state: "input-available",
            input: { result: "Done" },
          },
        ],
        metadata: { kind: "assistant", finishReason: "stop", totalTokens: 0 },
      },
    ];
    manager.connect(adaptor.commandAdaptor);
    await manager.watchTask("parent");
    return {
      adaptor,
      manager,
      controller,
      internals,
      async dispose() {
        controller.abort();
        await manager.wait("parent", { timeoutMs: 1000 });
        await adaptor.stopBackgroundCommands();
        await manager.dispose();
        await rm(commandOutputDir, { recursive: true, force: true });
      },
    };
  }

  it.each([
    { asyncWaitTimeoutInMs: 0, monitorTimeoutMs: undefined },
    { asyncWaitTimeoutInMs: 50, monitorTimeoutMs: undefined },
    { asyncWaitTimeoutInMs: 50, monitorTimeoutMs: 30_000 },
  ])(
    "honors the configured wait $asyncWaitTimeoutInMs with monitor timeout $monitorTimeoutMs",
    async ({ asyncWaitTimeoutInMs, monitorTimeoutMs }) => {
      const fixture = await setup(asyncWaitTimeoutInMs);
      const { adaptor, manager, controller, internals } = fixture;
      let waiting: Promise<boolean> | undefined;
      try {
        await manager.watchTask("sibling");
        const sibling = adaptor.startBackgroundCommand(
          "sibling",
          "printf ready >&2; exec sleep 30",
          ".",
          undefined,
          { description: "sibling" },
        );
        const parent = adaptor.startBackgroundCommand(
          "parent",
          "printf ready >&2; exec sleep 30",
          ".",
          undefined,
          {
            description: "monitor",
            timeoutMs: monitorTimeoutMs,
          },
        );
        await expect
          .poll(() =>
            Promise.all(
              [parent, sibling].map((job) => readFile(job.outputFile, "utf8")),
            ),
          )
          .toEqual(["ready", "ready"]);
        const wait = vi.spyOn(manager, "wait");
        waiting = internals.waitForAsyncWork();
        expect(wait).toHaveBeenCalledWith(
          "parent",
          expect.objectContaining({ timeoutMs: asyncWaitTimeoutInMs }),
        );
        expect(await waiting).toBe(true);
        // Cleanup must finish before the final notification is handed to the model.
        expect(manager.hasPending("parent")).toBe(false);
        expect(manager.getPendingNotifications("parent")).toContainEqual(
          expect.objectContaining({
            ended: expect.objectContaining({ status: "stopped" }),
          }),
        );
        expect(manager.hasPending("sibling")).toBe(true);
      } finally {
        controller.abort();
        await waiting;
        await fixture.dispose();
      }
    },
  );

  it("delivers a finished monitor after a previous delivery when async wait is disabled", async () => {
    const fixture = await setup(0);
    const { adaptor, manager, internals } = fixture;
    try {
      adaptor.startBackgroundCommand(
        "parent",
        "printf 'finished\\n'",
        ".",
        undefined,
        { description: "one event" },
      );
      expect(await manager.wait("parent", { timeoutMs: 1000 })).toBe(
        "completed",
      );
      const first = manager.getPendingNotifications("parent")[0];
      manager.takeReadyNotifications("parent", [
        { ...first, notificationId: "previous-delivery" },
      ]);
      expect(manager.getReadyNotifications("parent")).not.toEqual([]);
      expect(await internals.step()).toBe("next");
      const batches =
        internals.chat.messages
          .at(-1)
          ?.parts.flatMap((part) =>
            part.type === "data-monitor-events" ? part.data.batches : [],
          ) ?? [];
      expect(batches.flatMap((batch) => batch.lines)).toEqual(["finished"]);
      expect(batches.at(-1)?.ended?.status).toBe("completed");
    } finally {
      await fixture.dispose();
    }
  });

  it.each(["before waiting", "during cleanup"])(
    "does not start a notification turn after an abort %s",
    async (abortAt) => {
      const fixture = await setup(0);
      const { adaptor, controller, internals } = fixture;
      try {
        const job = adaptor.startBackgroundCommand(
          "parent",
          "printf ready >&2; exec sleep 30",
          ".",
          undefined,
          { description: "persistent" },
        );
        await expect.poll(() => readFile(job.outputFile, "utf8")).toBe("ready");
        if (abortAt === "before waiting") controller.abort();
        else {
          const stop = adaptor.stopBackgroundCommands.bind(adaptor);
          vi.spyOn(adaptor, "stopBackgroundCommands").mockImplementationOnce(
            async (taskId) => {
              controller.abort();
              await stop(taskId);
            },
          );
        }
        expect(await internals.step()).toBe("finished");
        expect(
          internals.chat.messages
            .flatMap((message) => message.parts)
            .some((part) => part.type === "data-monitor-events"),
        ).toBe(false);
      } finally {
        await fixture.dispose();
      }
    },
  );
});

it("shares commands across main, foreground and background agents, and only cleans them all up on root exit", async () => {
  const commandOutputDir = await mkdtemp(
    join(tmpdir(), "pochi-shared-adaptor-"),
  );
  const { store, tasks, messages } = makeJobStore();
  for (const id of ["parent", "front"]) {
    tasks.set(id, {
      id,
      cwd: process.cwd(),
      status: "completed",
      background: false,
      parentId: id === "front" ? "parent" : null,
    } as Task);
    messages.set(id, [
      {
        id: `${id}-result`,
        role: "assistant",
        parts: [
          {
            type: "tool-attemptCompletion",
            toolCallId: "done",
            state: "input-available",
            input: { result: "Done" },
          },
        ],
        metadata: { kind: "assistant", finishReason: "stop" },
      },
    ] as Message[]);
  }
  const adaptor = createTestCliAdaptor({ store, commandOutputDir });
  const manager = BackgroundJobManager.forStore(store);
  const root = new TaskRunner({
    adaptor,
    store,
    uid: "parent",
    cwd: process.cwd(),
    blobStore: {} as never,
    llm: { id: "test" } as never,
    filesystem: {} as never,
    rg: "rg",
    maxSteps: 24,
    maxRetries: 3,
    asyncWaitTimeoutInMs: 0,
  });
  const rootTools = (root as unknown as { toolCallOptions: ToolCallOptions })
    .toolCallOptions;
  const foreground = rootTools.createSubTaskRunner!("front");
  const foregroundTools = (
    foreground as unknown as { toolCallOptions: ToolCallOptions }
  ).toolCallOptions;
  let finishRoot!: () => void;
  const rootStep = vi
    .spyOn(root as unknown as { step(): Promise<"finished"> }, "step")
    .mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRoot = () => resolve("finished");
        }),
    );
  const rootRun = root.run();
  try {
    await vi.waitFor(() => expect(rootStep).toHaveBeenCalledOnce());
    await Promise.all(
      ["parent", "front", "back"].map((id) => manager.watchTask(id)),
    );
    for (const options of [rootTools, foregroundTools]) {
      const result = await executeCliToolCall(
        {
          type: "tool-executeCommand",
          toolCallId: `${options.taskId}-command`,
          state: "input-available",
          input: { command: "sleep 10", background: true },
        },
        options,
        process.cwd(),
      );
      expect(result).toMatchObject({
        _meta: { backgroundJobId: expect.stringMatching(/^bgjob-cmd-/) },
      });
    }
    await adaptor.executeToolCall({
      taskId: "back",
      parentTaskId: undefined,
      storeId: store.storeId,
      toolName: "executeCommand",
      toolCallId: "back-command",
      input: { command: "sleep 10", background: true },
      abortSignal: new AbortController().signal,
      toolPolicies: undefined,
    });
    await foreground.run();
    for (const id of ["parent", "front", "back"])
      expect(manager.hasPending(id)).toBe(true);
    await manager.kill(
      manager.getJobsForTask("back")[0].backgroundJobId,
      "back",
    );
    expect(await manager.wait("back", { timeoutMs: 1000 })).toBe("completed");
    expect(manager.hasPending("parent")).toBe(true);
    expect(manager.hasPending("front")).toBe(true);
    finishRoot();
    await rootRun;
    for (const id of ["parent", "front", "back"]) {
      expect(manager.getJobsForTask(id)).toEqual([
        expect.objectContaining({ status: "stopped" }),
      ]);
    }
  } finally {
    finishRoot?.();
    await rootRun;
    await adaptor.stopBackgroundCommands();
    await manager.dispose();
    await rm(commandOutputDir, { recursive: true, force: true });
  }
});
