import { z } from "zod/v4";

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

export { WebsiteTaskCreateEvent } from "./event";

export { toErrorMessage } from "./error";

export { builtInAgents } from "./agents";

export const PochiProviderOptions = z.object({
  taskId: z.string(),
  client: z.string(),
  useCase: z.union([
    z.literal("agent"),
    z.literal("output-schema"),
    z.literal("repair-tool-call"),
    z.literal("generate-task-title"),
    z.literal("compact-task"),
  ]),
});

export type PochiProviderOptions = z.infer<typeof PochiProviderOptions>;
