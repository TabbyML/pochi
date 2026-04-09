import type { useTaskMcpConfigOverride } from "@/lib/hooks/use-task-mcp-config-override";
import { prepareMessageParts } from "@/lib/message-utils";
import { getOrLoadTaskStore } from "@/lib/use-default-store";
import type { useLiveChatKit } from "@getpochi/livekit/react";
import type { StoreRegistry } from "@livestore/livestore";
import { useEffect, useState } from "react";
import type { useTranslation } from "react-i18next";

interface UseChatInitializationProps {
  chatKit: ReturnType<typeof useLiveChatKit>;
  info: NonNullable<typeof window.POCHI_TASK_INFO>;
  storeRegistry: StoreRegistry;
  jwt: string | null;
  t: ReturnType<typeof useTranslation>["t"];
  setMcpConfigOverride: ReturnType<
    typeof useTaskMcpConfigOverride
  >["setMcpConfigOverride"];
  isMcpConfigLoading: boolean;
}

export function useChatInitialization({
  chatKit,
  info,
  storeRegistry,
  jwt,
  t,
  setMcpConfigOverride,
  isMcpConfigLoading,
}: UseChatInitializationProps) {
  const [isInitializing, setIsInitializing] = useState(
    info.type === "fork-task",
  );

  useEffect(() => {
    if (chatKit.inited) {
      setIsInitializing(false);
      return;
    }

    if (isMcpConfigLoading) {
      return;
    }

    let cancelled = false;
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
      setIsInitializing(false);
    } else if (info.type === "compact-task") {
      chatKit.init(cwd, {
        messages: JSON.parse(info.messages),
      });
      setIsInitializing(false);
    } else if (info.type === "fork-task") {
      // Persist mcpConfigOverride to TaskStateStore for forked tasks
      if (info.mcpConfigOverride && setMcpConfigOverride) {
        setMcpConfigOverride(info.mcpConfigOverride);
      }

      if (info.forkParams) {
        const forkParams = info.forkParams;

        void (async () => {
          try {
            const sourceStore = await getOrLoadTaskStore({
              storeRegistry,
              storeId: forkParams.sourceStoreId,
              jwt,
            });

            try {
              if (cancelled === false) {
                chatKit.fork(sourceStore, {
                  taskId: forkParams.sourceTaskId,
                  title: forkParams.title,
                  commitId: forkParams.commitId,
                  messageId: forkParams.messageId,
                });
              }
            } finally {
              await sourceStore.shutdownPromise();
            }
          } finally {
            if (cancelled === false) {
              setIsInitializing(false);
            }
          }
        })();
      } else {
        setIsInitializing(false);
      }
    } else if (info.type === "open-task") {
      // Do nothing - mcpConfigOverride is loaded from TaskStateStore
      setIsInitializing(false);
    } else {
      assertUnreachable(info);
    }
    return () => {
      cancelled = true;
    };
  }, [
    chatKit,
    t,
    info,
    storeRegistry,
    jwt,
    setMcpConfigOverride,
    isMcpConfigLoading,
  ]);

  return { isInitializing };
}

function assertUnreachable(x: never): never {
  throw new Error(`Didn't expect to get here: ${JSON.stringify(x)}`);
}
