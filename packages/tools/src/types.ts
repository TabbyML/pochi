export { tool as defineClientTool } from "ai";
import type {
  InferToolInput,
  InferToolOutput,
  Tool,
  ToolExecutionOptions,
} from "ai";

/**
 * Represents the cached state of a file that the model has "seen".
 * Used for read deduplication and staleness detection in edit/write operations.
 *
 * This is the canonical definition; `@getpochi/common` re-exports it as
 * `FileState` for backwards compatibility.
 */
export interface IFileState {
  /** The file content (CRLF normalized to LF) */
  content: string;
  /** File modification time in milliseconds (Math.floor of mtimeMs) */
  timestamp: number;
  /** 1-indexed start line from Read, undefined for full-file reads or Edit/Write updates */
  startLine: number | undefined;
  /** 1-indexed end line (inclusive) from Read, undefined for full-file reads or Edit/Write updates */
  endLine: number | undefined;
  /** True for entries created by write/edit tools; absent or false for read entries */
  fromWrite?: boolean;
}

/**
 * Structural interface for the file state cache used by tool implementations.
 *
 * This is the canonical definition; `@getpochi/common` re-exports it and
 * provides the concrete `FileStateCache` class that implements it.
 */
export interface IFileStateCache {
  get(key: string): IFileState | undefined;
  set(key: string, value: IFileState): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
}

export type ToolFunctionType<T extends Tool> = (
  input: InferToolInput<T>,
  options: ToolExecutionOptions & {
    cwd: string;
    contentType?: string[];
    envs?: Record<string, string>;
    taskId?: string;
    executeCommandWhitelist?: string[];
    fileStateCache?: IFileStateCache;
  },
) => PromiseLike<InferToolOutput<T>> | InferToolOutput<T>;
