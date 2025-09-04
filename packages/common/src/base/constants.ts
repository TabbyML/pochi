import { homedir } from "node:os";

export const KnownTags = ["file", "workflow", "compact"] as const;
export const CompactTaskMinTokens = 50_000;

export const WorkspaceWorkflowPathSegments = [".pochi", "workflows"];
export const GlobalWorkspaceWorkflowPathSegments = [
  homedir(),
  ".pochi",
  "workflows",
];
