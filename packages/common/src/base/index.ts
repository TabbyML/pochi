import type { ToolSpecInput } from "@getpochi/tools";
import { z } from "zod";

export { attachTransport, getLogger } from "./logger";

export {
  formatters,
  type LLMFormatterOptions,
} from "./formatters";
export {
  assertBackgroundJobReadInterval,
  prompts,
  parseEnvironmentInfo,
} from "./prompts";

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
  AutoMemoryProjectInfoName,
  AutoMemoryTypeValues,
  truncateAutoMemoryIndex,
} from "./prompts/auto-memory";

export { WebsiteTaskCreateEvent } from "./event";

export { toErrorMessage } from "./error";

export { withTimeout } from "./async-utils";
export type { MaybePromise } from "./async-utils";

export * from "./message";
export type {
  AutoMemoryDreamCandidate,
  AutoMemoryDreamRun,
  AutoMemoryManager,
  AutoMemoryReadContextOptions,
  AutoMemoryTaskState,
  AutoMemoryTranscriptInfo,
  TaskMemoryState,
} from "./memory";
export { TaskMemoryFileUri } from "./prompts/task-memory";

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
  storeId: z.string(),
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
  projectMemory: number;
};

export interface BackgroundTaskState {
  tools?: readonly ToolSpecInput[];
  parentTaskId?: string;
  useCase?: ForkAgentUseCase;
  /** Step-start count inherited from the parent, excluded from the max-step guard. */
  baselineStepCount?: number;
}
