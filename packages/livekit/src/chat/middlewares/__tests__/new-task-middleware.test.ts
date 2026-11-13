import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type { CustomAgent } from "@getpochi/tools";
import { describe, expect, it, vi } from "vitest";
import type { LiveKitStore } from "../../../types";
import { createNewTaskMiddleware } from "../new-task-middleware";

const customAgents: CustomAgent[] = [
  {
    name: "fixer",
    description: "Fixes bugs",
    systemPrompt: "Fix bugs.",
    isolation: "worktree",
  },
  { name: "explore", description: "Explores", systemPrompt: "Explore." },
  {
    name: "audit",
    description: "Internal audit",
    systemPrompt: "Audit.",
    _internal: {},
  },
];

async function callNewTask(
  input: Record<string, unknown>,
  getSubagentWorktreePath: (taskId: string) => Promise<string | undefined> =
    async (taskId) => `/repo.worktree/subagent-${taskId}`,
) {
  const commit = vi.fn();
  const store = { commit } as unknown as LiveKitStore;
  const middleware = createNewTaskMiddleware(
    store,
    "/repo",
    "parent",
    customAgents,
    getSubagentWorktreePath,
  );
  const chunk: LanguageModelV3StreamPart = {
    type: "tool-call",
    toolCallId: "call",
    toolName: "newTask",
    input: JSON.stringify(input),
  };
  const { stream } = await middleware.wrapStream!({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(chunk);
          controller.close();
        },
      }),
    }),
  } as unknown as Parameters<NonNullable<typeof middleware.wrapStream>>[0]);
  const parts: LanguageModelV3StreamPart[] = [];
  for await (const part of stream as unknown as AsyncIterable<LanguageModelV3StreamPart>) {
    parts.push(part);
  }
  const toolCall = parts.find((part) => part.type === "tool-call");
  const args = JSON.parse(
    (toolCall as Extract<LanguageModelV3StreamPart, { type: "tool-call" }>)
      .input,
  );
  const taskInited = commit.mock.calls
    .map(([event]) => event)
    .find((event) => event.name === "v1.TaskInited");
  return {
    args,
    taskInited,
    taskCwd: taskInited?.args.cwd as string | undefined,
  };
}

describe("createNewTaskMiddleware top-level task", () => {
  const base = { description: "Task", prompt: "Do it", spawn: "task" };

  it("assigns an id without creating a subtask", async () => {
    const getSubagentWorktreePath = vi.fn(async () => "/unused");
    const { args, taskInited } = await callNewTask(
      { ...base, isolation: "worktree" },
      getSubagentWorktreePath,
    );
    expect(args._meta.uid).toEqual(expect.any(String));
    expect(taskInited).toBeUndefined();
    expect(getSubagentWorktreePath).not.toHaveBeenCalled();
  });

  it("keeps an explicit worktree request", async () => {
    const { args } = await callNewTask({ ...base, isolation: "worktree" });
    expect(args.isolation).toBe("worktree");
  });

  it.each(["fixer", "audit", "missing"])(
    "rejects agentType %s",
    async (agentType) => {
      await expect(callNewTask({ ...base, agentType })).rejects.toThrow(
        'agentType is not supported with spawn "task"',
      );
    },
  );
});

describe("createNewTaskMiddleware isolation", () => {
  const base = { description: "Task", prompt: "Do it" };

  it("applies the agent's configured isolation", async () => {
    const { args } = await callNewTask({ ...base, agentType: "fixer" });
    expect(args.isolation).toBe("worktree");
  });

  it("keeps an explicit isolation for agents without one", async () => {
    const { args } = await callNewTask({
      ...base,
      agentType: "explore",
      isolation: "worktree",
    });
    expect(args.isolation).toBe("worktree");
  });

  it('runs in the current checkout with isolation "none"', async () => {
    const getSubagentWorktreePath = vi.fn(async () => "/unused");
    const { args, taskCwd } = await callNewTask(
      { ...base, agentType: "explore", isolation: "none" },
      getSubagentWorktreePath,
    );
    expect(args.isolation).toBe("none");
    expect(taskCwd).toBe("/repo");
    expect(getSubagentWorktreePath).not.toHaveBeenCalled();
  });

  it('applies the configured isolation over an explicit "none"', async () => {
    const { args, taskCwd } = await callNewTask({
      ...base,
      agentType: "fixer",
      isolation: "none",
    });
    expect(args.isolation).toBe("worktree");
    expect(taskCwd).toBe(`/repo.worktree/subagent-${args._meta.uid}`);
  });

  it("leaves isolation unset by default", async () => {
    const { args, taskCwd } = await callNewTask({
      ...base,
      agentType: "explore",
    });
    expect(args.isolation).toBeUndefined();
    expect(taskCwd).toBe("/repo");
  });

  it("initializes an isolated subtask with its worktree cwd", async () => {
    const { args, taskCwd } = await callNewTask({
      ...base,
      agentType: "fixer",
    });
    expect(taskCwd).toBe(`/repo.worktree/subagent-${args._meta.uid}`);
  });

  it("rejects isolation outside a git repository", async () => {
    await expect(
      callNewTask({ ...base, agentType: "fixer" }, async () => undefined),
    ).rejects.toThrow();
  });
});
