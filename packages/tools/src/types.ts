export { tool as defineClientTool } from "ai";
import type {
  InferToolInput,
  InferToolOutput,
  Tool,
  ToolCallOptions,
} from "ai";
import type { z } from "zod";
import type { EditFileOutputSchema } from "./constants";

export type ToolFunctionType<T extends Tool> = (
  input: InferToolInput<T>,
  options: ToolCallOptions & {
    nonInteractive?: boolean;
    cwd: string;
    contentType?: string[];
  },
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
    nonInteractive?: boolean;
  },
) => Promise<PreviewReturnType>;
