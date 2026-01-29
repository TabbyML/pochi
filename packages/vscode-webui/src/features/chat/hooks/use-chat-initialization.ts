import type { useTaskMcpConfigOverride } from "@/lib/hooks/use-task-mcp-config-override";
import { prepareMessageParts } from "@/lib/message-utils";
import type { useLiveChatKit } from "@getpochi/livekit/react";
import { useEffect } from "react";
import type { useTranslation } from "react-i18next";

interface UseChatInitializationProps {
  chatKit: ReturnType<typeof useLiveChatKit>;
  info: NonNullable<typeof window.POCHI_TASK_INFO>;
  t: ReturnType<typeof useTranslation>["t"];
  setMcpConfigOverride: ReturnType<
    typeof useTaskMcpConfigOverride
  >["setMcpConfigOverride"];
  isMcpConfigLoading: boolean;
}

export function useChatInitialization({
  chatKit,
  info,
  t,
  setMcpConfigOverride,
  isMcpConfigLoading,
}: UseChatInitializationProps) {
  useEffect(() => {
    if (chatKit.inited || isMcpConfigLoading) return;
    const cwd = info.cwd;
    if (info.type === "new-task") {
      if (info.mcpConfigOverride && setMcpConfigOverride) {
        setMcpConfigOverride(info.mcpConfigOverride);
      }

      const activeSelection = info.activeSelection;
      const files = info.files?.map((file) => ({
        type: "file" as const,
        filename: file.name,
        mediaType: file.contentType,
        url: file.url,
      }));
      const shouldUseParts = (files?.length ?? 0) > 0 || !!activeSelection;

      if (shouldUseParts) {
        chatKit.init(cwd, {
          prompt: info.prompt,
          parts: prepareMessageParts(
            t,
            info.prompt || "",
            files || [],
            [],
            undefined,
            activeSelection,
          ),
        });
      } else {
        chatKit.init(cwd, {
          prompt: info.prompt ?? undefined,
        });
      }
    } else if (info.type === "compact-task") {
      chatKit.init(cwd, {
        messages: JSON.parse(info.messages),
      });
    } else if (info.type === "fork-task") {
      // Persist mcpConfigOverride to TaskStateStore for forked tasks
      if (info.mcpConfigOverride && setMcpConfigOverride) {
        setMcpConfigOverride(info.mcpConfigOverride);
      }
    } else if (info.type === "open-task") {
      // Do nothing - mcpConfigOverride is loaded from TaskStateStore
    } else {
      assertUnreachable(info);
    }
  }, [chatKit, t, info, setMcpConfigOverride, isMcpConfigLoading]);
}

function assertUnreachable(x: never): never {
  throw new Error(`Didn't expect to get here: ${JSON.stringify(x)}`);
}
