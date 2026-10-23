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
  return { args, taskCwd: taskInited?.args.cwd as string | undefined };
}

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
