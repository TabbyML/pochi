import {
  type RenderWidgetError,
  type RenderWidgetErrorKind,
  useRenderWidgetStore,
} from "@/features/chat";
import type { Message } from "@getpochi/livekit";
import { getStaticToolName, isStaticToolUIPart } from "ai";
import { useMemo } from "react";

export function useRenderWidgetError({
  messages,
}: {
  messages: Message[];
}) {
  const widgetErrors = useRenderWidgetStore((state) => state.widgetErrors);

  return useMemo(
    () =>
      getRenderWidgetError(messages, (toolCallId) =>
        widgetErrors.get(toolCallId),
      ),
    [messages, widgetErrors],
  );
}

export function getRenderWidgetError(
  messages: Message[],
  getWidgetError: (toolCallId: string) => RenderWidgetError | undefined,
): RenderWidgetErrorKind | undefined {
  let hasRuntimeError = false;

  for (const toolCallId of getLatestRenderWidgetToolCallIds(messages)) {
    const error = getWidgetError(toolCallId);
    if (!error) continue;
    if (error.kind === "internal") return "internal";
    hasRuntimeError = true;
  }

  return hasRuntimeError ? "runtime" : undefined;
}

function getLatestRenderWidgetToolCallIds(messages: Message[]): string[] {
  const message = messages.at(-1);
  if (message?.role !== "assistant") return [];
  const toolCallIds: string[] = [];
  for (const part of message.parts) {
    if (
      !isStaticToolUIPart(part) ||
      getStaticToolName(part) !== "renderWidget"
    ) {
      continue;
    }
    toolCallIds.push(part.toolCallId);
  }
  return toolCallIds;
}
