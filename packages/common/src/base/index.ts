import type { ToolSpecInput } from "@getpochi/tools";
import { z } from "zod";

export { attachTransport, getLogger } from "./logger";

export {
  formatters,
  type LLMFormatterOptions,
} from "./formatters";
export { prompts } from "./prompts";

export { SocialLinks } from "./social";
export * as constants from "./constants";

export {
  Environment,
  type GitStatus,
} from "./environment";
export type {
  AutoMemoryContext,
  AutoMemoryDreamSession,
  AutoMemoryManifestEntry,
  AutoMemoryType,
} from "./prompts/auto-memory";
export {
  AutoMemoryIndexName,
  AutoMemoryLockName,
  AutoMemoryMaxManifestEntries,
  AutoMemoryTypeValues,
  truncateAutoMemoryIndex,
} from "./prompts/auto-memory";

export { WebsiteTaskCreateEvent } from "./event";

export { toErrorMessage } from "./error";

export { withTimeout } from "./async-utils";

export { builtInAgents } from "./agents";

export { builtInSkills, BuiltInSkillPath } from "./skills";
export * from "./message-context";
export type { AutoMemoryTaskState, TaskMemoryState } from "./memory";

export const ForkAgentUseCase = z.enum([
  "task-memory",
  "auto-memory",
  "auto-memory-dream",
]);

export type ForkAgentUseCase = z.infer<typeof ForkAgentUseCase>;

export const PochiRequestUseCase = z.enum([
  "agent",
  "output-schema",
  "repair-tool-call",
  "generate-task-title",
  "compact-task",
  "auto-compact-task",
  "repair-mermaid",
  ...ForkAgentUseCase.options,
]);

export type PochiRequestUseCase = z.infer<typeof PochiRequestUseCase>;

export const PochiProviderOptions = z.object({
  taskId: z.string(),
  client: z.string(),
  useCase: PochiRequestUseCase,
});

export type PochiProviderOptions = z.infer<typeof PochiProviderOptions>;

/** Returns true if the given use case is a fork agent use case. */
export function isForkAgentUseCase(
  useCase: string | undefined,
): useCase is ForkAgentUseCase {
  return ForkAgentUseCase.safeParse(useCase).success;
}

export type ContextWindowUsage = {
  system: number;
  tools: number;
  messages: number;
  files: number;
  toolResults: number;
};

export interface BackgroundTaskState {
  tools?: readonly ToolSpecInput[];
  parentTaskId?: string;
  useCase?: ForkAgentUseCase;
}
