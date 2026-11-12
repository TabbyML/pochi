import { describe, expect, it } from "vitest";
import { isBackgroundSubAgentRequested, shouldRunSubAgentInBackground } from "../subagent";

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
