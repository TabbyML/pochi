import {
  buildForkAgentInitTitle,
  createForkAgent,
} from "../index";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

describe("createForkAgent", () => {
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
    ] as UIMessage[];

    const result = createForkAgent({
      label: "task-memory",
      parentMessages,
      parentCwd: "/repo",
      directive: "extract memory",
    }).initMessages;

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

  it("builds a fork agent with path-pattern tool rules", () => {
    const agent = createForkAgent({
      label: "task-memory",
      initTitle: "[Task Memory Extraction] Parent Task Title",
      parentTaskId: "parent-task",
      parentMessages: [],
      parentCwd: "/repo",
      directive: "extract memory",
      tools: ["readFile(/memory/**)", "writeToFile(/memory/**)"],
    });

    expect(agent).toMatchObject({
      cwd: "/repo",
      label: "task-memory",
      initTitle: "[Task Memory Extraction] Parent Task Title",
      parentTaskId: "parent-task",
      tools: [
        "readFile(/memory/**)",
        "writeToFile(/memory/**)",
        "attemptCompletion",
      ],
      baselineStepCount: 0,
    });
    expect(agent).not.toHaveProperty("taskId");
    expect(agent).not.toHaveProperty("createdAt");
  });

  it("builds baselineStepCount derived from parent step-start parts", () => {
    const parentMessages = [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
      {
        id: "m2",
        role: "assistant",
        parts: [
          { type: "step-start" },
          { type: "text", text: "a" },
          { type: "step-start" },
          { type: "text", text: "b" },
        ],
      },
      {
        id: "m3",
        role: "assistant",
        parts: [{ type: "step-start" }, { type: "text", text: "c" }],
      },
    ] as UIMessage[];

    const agent = createForkAgent({
      label: "task-memory",
      parentMessages,
      parentCwd: "/repo",
      directive: "extract memory",
    });

    expect(agent.baselineStepCount).toBe(3);
  });
});

describe("buildForkAgentInitTitle", () => {
  it("returns the bracketed use-case label when no parent title is provided", () => {
    expect(buildForkAgentInitTitle("task-memory")).toBe(
      "[Task Memory Extraction]",
    );
    expect(buildForkAgentInitTitle("auto-memory")).toBe(
      "[Auto Memory Extraction]",
    );
    expect(buildForkAgentInitTitle("auto-memory-dream")).toBe(
      "[Auto Memory Dream]",
    );
  });

  it("appends the parent task title when available", () => {
    expect(buildForkAgentInitTitle("task-memory", "Build something")).toBe(
      "[Task Memory Extraction] Build something",
    );
  });

  it("ignores blank parent titles", () => {
    expect(buildForkAgentInitTitle("auto-memory", "   ")).toBe(
      "[Auto Memory Extraction]",
    );
  });
});
