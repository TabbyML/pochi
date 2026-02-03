export const KnownTags = [
  "file",
  "compact",
  "custom-agent",
  "skill",
  "issue",
] as const;

export const CompactTaskMinTokens = 50_000;

export const DefaultContextWindow = 100_000;
export const DefaultMaxOutputTokens = 4096;

export const PochiTaskIdHeader = "x-pochi-task-id";
export const PochiClientHeader = "x-pochi-client";
export const PochiRequestUseCaseHeader = "x-pochi-request-use-case";
