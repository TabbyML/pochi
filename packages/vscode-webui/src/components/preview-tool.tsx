import { useToolCallLifeCycle } from "@/features/chat";
import type { Message, UITools } from "@getpochi/livekit";
import { type ToolUIPart, getToolName, isToolUIPart } from "ai";
import { useEffect, useMemo } from "react";
import { funnel } from "remeda";

export function PreviewTool({ messages }: { messages: Message[] }) {
  const lastMessage = messages.at(-1);
  if (!lastMessage) {
    return null;
  }
  const components = lastMessage.parts.map((part) => {
    if (
      isToolUIPart(part) &&
      part.state !== "output-available" &&
      part.state !== "output-error"
    ) {
      return <PreviewOneTool key={part.toolCallId} tool={part} />;
    }
  });
  return <>{components}</>;
}

function PreviewOneTool({
  tool,
}: {
  tool: ToolUIPart<UITools>;
}) {
  const { getToolCallLifeCycle } = useToolCallLifeCycle();
  const debouncedPreview = useMemo(
    () =>
      funnel(
        (tool: ToolUIPart<UITools>) => {
          const lifecycle = getToolCallLifeCycle({
            toolName: getToolName(tool),
            toolCallId: tool.toolCallId,
          });
          if (lifecycle.status === "init" || lifecycle.status === "pre-init") {
            lifecycle.preview(tool.input, tool.state);
          }
        },
        {
          maxBurstDurationMs: 500,
          reducer: (_, rhs: ToolUIPart<UITools>) => rhs,
        },
      ),
    [getToolCallLifeCycle],
  );
  useEffect(() => {
    debouncedPreview.call(tool);
  }, [tool, debouncedPreview]);

  return null;
}
