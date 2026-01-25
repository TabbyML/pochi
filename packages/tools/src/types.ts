export { tool as defineClientTool } from "ai";
import type {
  InferToolInput,
  InferToolOutput,
  Tool,
  ToolCallOptions,
} from "ai";
import type { z } from "zod";
import type { EditFileOutputSchema } from "./constants";

export type ToolFunctionOptions = ToolCallOptions & {
  cwd: string;
  contentType?: string[];
  envs?: Record<string, string>;
};

export type ToolFunctionType<T extends Tool> = (
  input: InferToolInput<T>,
  options: ToolFunctionOptions,
) => PromiseLike<InferToolOutput<T>> | InferToolOutput<T>;

export type PreviewReturnType =
  | { error: string }
  | z.infer<typeof EditFileOutputSchema>
  | undefined;

export type PreviewToolFunctionType<T extends Tool> = (
  args: Partial<InferToolInput<T>> | null,
  options: {
    toolCallId: string;
    state: "partial-call" | "call" | "result";
    abortSignal?: AbortSignal;
    cwd: string;
  },
) => Promise<PreviewReturnType>;
