import type { Message } from "@getpochi/livekit";
import { useRenderWidgetStore } from "../hooks/use-render-widget-store";

/**
 * Handles the onOverrideMessages event before each request: commits the
 * latest renderWidget UI state into the tool outputs the model will see.
 */
export function onOverrideMessages({ messages }: { messages: Message[] }) {
  writeRenderWidgetOutput(messages);
}

export function writeRenderWidgetOutput(messages: Message[]) {
  const store = useRenderWidgetStore.getState();
  const message = getRenderWidgetOutputMessage(messages);
  if (!message) return;

  message.parts = message.parts.map((part) => {
    if (part.type !== "tool-renderWidget") return part;
    if (part.state !== "input-available" && part.state !== "output-available") {
      return part;
    }

    const state =
      store.getWidgetState(part.toolCallId) ??
      getExistingRenderWidgetState(part.output) ??
      {};
    const output = { state };
    const error = store.getWidgetError(part.toolCallId);
    if (error !== undefined) {
      // @ts-expect-error renderWidget output schema intentionally omits runtime errors.
      output.error = error.message;
    }
    store.clearWidgetState(part.toolCallId);
    return {
      ...part,
      state: "output-available",
      output,
    };
  });
}

function getRenderWidgetOutputMessage(messages: Message[]) {
  if (messages.at(-1)?.role !== "user") return;
  const message = messages.at(-2);
  return message?.role === "assistant" ? message : undefined;
}

function getExistingRenderWidgetState(output: unknown) {
  if (typeof output !== "object" || output === null) return undefined;
  if (!Object.hasOwn(output, "state")) return undefined;
  return (output as { state?: unknown }).state;
}
