import type { ToolUIPart } from "ai";
import type {
  StreamingResult,
  ToolCallLifeCycle,
} from "./tool-call-life-cycle";

export class FixedStateToolCallLifeCycle implements ToolCallLifeCycle {
  constructor(
    readonly toolName: string,
    readonly toolCallId: string,
    readonly status: "execute" | "dispose",
    readonly streamingResult: StreamingResult | undefined,
  ) {}

  get complete(): { result: unknown; reason: "execute-finish" | "user-abort" } {
    throw new Error(
      "Method 'get complete()' should not be called on FixedStateToolCallLifeCycle.",
    );
  }

  dispose() {
    // no-op
  }

  preview(_args: unknown, _state: ToolUIPart["state"]) {
    // no-op for preview tool call on FixedStateToolCallLifeCycle
  }

  execute(_args: unknown) {
    throw new Error(
      "Method 'execute()' should not be called on FixedStateToolCallLifeCycle.",
    );
  }

  abort() {
    throw new Error(
      "Method 'abort()' should not be called on FixedStateToolCallLifeCycle.",
    );
  }

  reject() {
    throw new Error(
      "Method 'reject()' should not be called on FixedStateToolCallLifeCycle.",
    );
  }
}
