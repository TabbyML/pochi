import { describe, expect, it } from "vitest";
import {
  createBackgroundSubAgentStartedResult,
  getSubagentTranscriptPath,
  isBackgroundSubAgentRequested,
  shouldRunSubAgentInBackground,
} from "../subagent";

describe("subagent transcript path", () => {
  it("places the transcript next to the parent's background job output", () => {
    expect(getSubagentTranscriptPath("/home/me/", "parent", "child")).toBe(
      "/home/me/.pochi/tasks/parent/background-jobs/bgjob-task-child.md",
    );
  });
  it("uses Windows separators for a Windows home directory", () => {
    expect(getSubagentTranscriptPath("C:\\Users\\me", "parent", "child")).toBe(
      "C:\\Users\\me\\.pochi\\tasks\\parent\\background-jobs\\bgjob-task-child.md",
    );
  });
  it("keeps task ids inside their path segment", () => {
    expect(getSubagentTranscriptPath("/home/me", "../x", "a/b")).toBe(
      "/home/me/.pochi/tasks/_x/background-jobs/bgjob-task-a_b.md",
    );
  });
  it("names the transcript in the started result only when it is known", () => {
    expect(createBackgroundSubAgentStartedResult("child", "/t/child.md")).toContain(
      "Its transcript is updated after each of its steps at /t/child.md.",
    );
    expect(createBackgroundSubAgentStartedResult("child")).not.toContain(
      "transcript",
    );
  });
});

describe("subagent background selection", () => {
  it.each([undefined, {}, { background: true }, { agentType: "explore" }, { agentType: "reviewer" }, { agentType: "browser" }, { agentType: "planner" }])("defaults %s to the background", (input) => {
    expect(shouldRunSubAgentInBackground(input)).toBe(true);
  });
  it.each([
    { background: false },
    { background: false, agentType: "browser" },
    { background: true, agentType: "guide" },
    { background: true, agentType: "attemptTodoCompletion" },
  ])("keeps %s in the foreground", (input) => {
    expect(shouldRunSubAgentInBackground(input)).toBe(false);
  });
  it("distinguishes an explicit background request from the default", () => {
    expect(isBackgroundSubAgentRequested({ background: true })).toBe(true);
    expect(isBackgroundSubAgentRequested({})).toBe(false);
    expect(isBackgroundSubAgentRequested({ background: true, agentType: "guide" })).toBe(false);
  });
});
