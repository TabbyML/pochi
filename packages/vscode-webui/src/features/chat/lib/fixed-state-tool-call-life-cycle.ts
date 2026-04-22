import type {
  CompleteReason,
  StreamingResult,
  ToolCallLifeCycle,
  ToolCallLifeCycleEvents,
} from "./tool-call-life-cycle";

export class FixedStateToolCallLifeCycle implements ToolCallLifeCycle {
  constructor(
    readonly toolName: string,
    readonly toolCallId: string,
    readonly status: "execute" | "dispose",
    readonly streamingResult: StreamingResult | undefined,
  ) {}

  get complete(): { result: unknown; reason: CompleteReason } {
    throw new Error(
      "Method 'get complete()' should not be called on FixedStateToolCallLifeCycle.",
    );
  }

  dispose() {
    // no-op
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

  addResult(_result: unknown): void {
    throw new Error(
      "Method 'addResult()' should not be called on FixedStateToolCallLifeCycle.",
    );
  }

  on<K extends keyof ToolCallLifeCycleEvents>(
    _eventName: K,
    _listener: (eventData: ToolCallLifeCycleEvents[K]) => void,
  ): () => void {
    // FixedStateToolCallLifeCycle has a frozen state; no events will be emitted.
    return () => {};
  }
}
