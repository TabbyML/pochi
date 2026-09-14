import { describe, expect, it } from "vitest";
import { createBackgroundJobId, parseBackgroundJobId, getSubAgentBackgroundJobId, getSubAgentTaskId } from "../background-job-id";

describe("background job IDs", () => {
  it.each(["command", "monitor", "task", "terminal"] as const)("recognizes generated %s IDs", (type) => {
    expect(parseBackgroundJobId(createBackgroundJobId(type))).toBe(type);
  });
  it.each(["", "unknown", "prefix-bgjob-task-child", "bgjob-command-child"])("rejects unknown prefix %s", id => {
    expect(parseBackgroundJobId(id)).toBeUndefined();
  });
  it("round-trips subtask IDs and only extracts task IDs", () => {
    expect(getSubAgentTaskId(getSubAgentBackgroundJobId("child-123"))).toBe("child-123");
    expect(getSubAgentTaskId("bgjob-task-")).toBeUndefined();
    expect(getSubAgentTaskId("bgjob-cmd-child")).toBeUndefined();
    expect(getSubAgentTaskId("term-child")).toBeUndefined();
  });
});
