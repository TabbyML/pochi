import { isStaticToolUIPart } from "ai";
import type { NodeChatState } from "../livekit/chat.node";
import type { StreamRenderer } from "./types";

export interface AttemptCompletionResultRendererOptions {
  attemptCompletionSchemaOverride?: boolean;
}

export class AttemptCompletionResultRenderer implements StreamRenderer {
  private attemptCompletionSchemaOverride: boolean;

  constructor(
    private readonly stream: NodeJS.WritableStream,
    private readonly state: NodeChatState,
    options: AttemptCompletionResultRendererOptions = {},
  ) {
    this.attemptCompletionSchemaOverride =
      !!options.attemptCompletionSchemaOverride;
  }

  async shutdown() {
    const messages = this.state.signal.messages.value;
    const lastMessage = messages.at(-1);

    if (lastMessage?.role === "assistant") {
      for (const part of lastMessage.parts || []) {
        if (
          isStaticToolUIPart(part) &&
          part.type === "tool-attemptCompletion"
        ) {
          if (part.input) {
            const input = part.input as Record<string, unknown>;
            if (this.attemptCompletionSchemaOverride) {
              this.stream.write(`${JSON.stringify(input.result, null, 2)}\n`);
            } else {
              this.stream.write(`${input.result}\n`);
            }
          }
          return;
        }
      }
    }
  }
}
