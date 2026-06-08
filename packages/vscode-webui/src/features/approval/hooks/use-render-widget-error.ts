import { useRenderWidgetStore } from "@/features/chat/hooks/use-render-widget-store";
import type {
  RenderWidgetError,
  RenderWidgetErrorKind,
} from "@/features/chat/lib/render-widget-error";
import type { Message } from "@getpochi/livekit";
import { useMemo } from "react";

type RenderWidgetPart = Extract<
  Message["parts"][number],
  { type: "tool-renderWidget" }
>;

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

  for (const part of getLatestRenderWidgetParts(messages)) {
    const error = getWidgetError(part.toolCallId);
    if (!error) continue;
    if (error.kind === "internal") return "internal";
    hasRuntimeError = true;
  }

  return hasRuntimeError ? "runtime" : undefined;
}

function getLatestRenderWidgetParts(messages: Message[]): RenderWidgetPart[] {
  const message = messages.at(-1);
  if (message?.role !== "assistant") return [];
  return message.parts.filter(
    (part): part is RenderWidgetPart => part.type === "tool-renderWidget",
  );
}
