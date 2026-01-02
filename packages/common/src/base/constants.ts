export const KnownTags = [
  "file",
  "workflow",
  "compact",
  "custom-agent",
  "issue",
] as const;
export const CompactTaskMinTokens = 50_000;

// Built-in agent names
export const WALKTHROUGH_AGENT_NAME = "walkthroughs";
export const EXPLORE_AGENT_NAME = "explore";
export const DEBUGGER_AGENT_NAME = "debugger";

export const WorkspaceWorkflowPathSegments = [".pochi", "workflows"];

export const DefaultContextWindow = 100_000;
export const DefaultMaxOutputTokens = 4096;

export const PochiTaskIdHeader = "x-pochi-task-id";
export const PochiClientHeader = "x-pochi-client";
export const PochiRequestUseCaseHeader = "x-pochi-request-use-case";
