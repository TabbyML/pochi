import { describe, expect, it } from "vitest";
import { isBackgroundSubAgentRequested, shouldRunSubAgentInBackground } from "../subagent";

describe("subagent background selection", () => {
  it.each([undefined, {}, { background: true }, { agentType: "explore" }, { agentType: "reviewer" }])("defaults %s to the background", (input) => {
    expect(shouldRunSubAgentInBackground(input)).toBe(true);
  });
  it.each([
    { background: false },
    { background: true, agentType: "browser" },
    { background: true, agentType: "planner" },
    { background: true, agentType: "guide" },
    { background: true, agentType: "attemptTodoCompletion" },
  ])("keeps %s in the foreground", (input) => {
    expect(shouldRunSubAgentInBackground(input)).toBe(false);
  });
  it("distinguishes an explicit background request from the default", () => {
    expect(isBackgroundSubAgentRequested({ background: true })).toBe(true);
    expect(isBackgroundSubAgentRequested({})).toBe(false);
    expect(isBackgroundSubAgentRequested({ background: true, agentType: "planner" })).toBe(false);
  });
});
