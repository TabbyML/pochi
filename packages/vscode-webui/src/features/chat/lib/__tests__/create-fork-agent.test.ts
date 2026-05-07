import { type Message, catalog } from "@getpochi/livekit";
import {
  type ToolSpecInput,
  compileToolPolicies,
  getAllowedToolNames,
} from "@getpochi/tools";
import { describe, expect, it } from "vitest";
import { buildForkMessages, createForkAgent } from "../create-fork-agent";

describe("buildForkMessages", () => {
  it("clones parent messages with fresh ids", () => {
    const parentMessages = [
      {
        id: "parent-message-1",
        role: "user",
        parts: [
          { type: "text", text: "hello" },
          { type: "data-checkpoint", data: { commit: "abc123" } },
        ],
      },
      {
        id: "parent-message-2",
        role: "assistant",
        parts: [{ type: "text", text: "done" }],
      },
    ] as Message[];

    const result = buildForkMessages(parentMessages, "extract memory");

    expect(result).toHaveLength(3);
    expect(result[0].id).not.toBe(parentMessages[0].id);
    expect(result[1].id).not.toBe(parentMessages[1].id);
    expect(result[0].parts).toEqual(parentMessages[0].parts);
    expect(result[1].parts).toEqual(parentMessages[1].parts);
    expect(result[2]).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "extract memory" }],
    });
  });

  it("persists async agent tools with path-pattern rules", async () => {
    const states: unknown[] = [];
    const commits: unknown[] = [];

    await createForkAgent({
      store: {
        commit: (event: unknown) => commits.push(event),
      } as never,
      label: "task-memory",
      parentTaskId: "parent-task",
      parentMessages: [],
      parentCwd: "/repo",
      directive: "extract memory",
      tools: ["readFile(/memory/**)", "writeToFile(/memory/**)"],
      setAsyncAgentState: (_taskId, state) => {
        states.push(state);
      },
    });

    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({
      name: catalog.events.asyncTaskInited.name,
      args: { runAsync: true },
    });
    expect(catalog.events.asyncTaskInited.options.clientOnly).toBe(true);
    expect(states).toEqual([
      {
        parentTaskId: "parent-task",
        tools: [
          "readFile(/memory/**)",
          "writeToFile(/memory/**)",
          "attemptCompletion",
        ],
        messageCacheBreakpoint: "secondLast",
        useCase: "task-memory",
      },
    ]);
  });
});

describe("task-memory tool policy", () => {
  const TaskMemoryAllowedTools: readonly ToolSpecInput[] = [
    "readFile",
    "writeToFile(pochi://-/memory.md)",
  ];

  it("derives the allowed tool name set", () => {
    const allowed = getAllowedToolNames([...TaskMemoryAllowedTools]);

    expect(allowed.has("readFile")).toBe(true);
    expect(allowed.has("writeToFile")).toBe(true);
    expect(allowed.has("executeCommand")).toBe(false);
  });

  it("compiles a writeToFile path policy scoped to memory.md", () => {
    const policies = compileToolPolicies([...TaskMemoryAllowedTools]);

    expect(policies?.writeToFile).toEqual({
      kind: "path-pattern",
      patterns: ["pochi://-/memory.md"],
    });
    expect(policies?.readFile).toBeUndefined();
  });
});
