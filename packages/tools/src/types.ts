export { tool as defineClientTool } from "ai";
import type {
  InferToolInput,
  InferToolOutput,
  Tool,
  ToolCallOptions,
} from "ai";

export type ToolFunctionType<T extends Tool> = (
  input: InferToolInput<T>,
  options: ToolCallOptions & {
    cwd: string;
    contentType?: string[];
    envs?: Record<string, string>;
    taskId?: string;
  },
) => PromiseLike<InferToolOutput<T>> | InferToolOutput<T>;
