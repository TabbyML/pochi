import { MessageMarkdown } from "@/components/message";
import { Button } from "@/components/ui/button";
import { useSendMessage } from "@/features/chat";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { useCustomAgent } from "@/lib/hooks/use-custom-agents";
import { useWalkthroughPath } from "@/lib/hooks/use-walkthrough-path";
import { vscodeHost } from "@/lib/vscode";
import { WALKTHROUGH_AGENT_NAME } from "@getpochi/common";
import { catalog } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ToolProps } from "./types";

export const AttemptCompletionTool: React.FC<
  ToolProps<"attemptCompletion">
> = ({ tool: toolCall, isExecuting, isLoading, messages, taskId }) => {
  const { t } = useTranslation();
  const sendMessage = useSendMessage();
  const { store } = useStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(taskId ?? ""));
  const { data: currentWorkspace } = useCurrentWorkspace();
  const walkthroughAgentName = WALKTHROUGH_AGENT_NAME;
  const { customAgent } = useCustomAgent(walkthroughAgentName);
  const walkthroughBasePath =
    currentWorkspace?.workspacePath ?? task?.cwd ?? null;
  const { walkthroughPath, hasExistingWalkthrough, refreshWalkthroughStatus } =
    useWalkthroughPath(taskId);
  const { result = "" } = toolCall.input || {};
  const latestAttemptCompletionId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      for (let j = message.parts.length - 1; j >= 0; j--) {
        const part = message.parts[j];
        if (part.type === "tool-attemptCompletion") {
          return part.toolCallId;
        }
      }
    }

    return undefined;
  }, [messages]);
  const [isGeneratingWalkthrough, setIsGeneratingWalkthrough] = useState(false);

  useEffect(() => {
    if (!isGeneratingWalkthrough) {
      return;
    }

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      for (let j = message.parts.length - 1; j >= 0; j--) {
        const part = message.parts[j];
        if (part.type !== "tool-newTask") {
          continue;
        }
        if (
          (part.input?.agentType ?? "").toLowerCase() !== walkthroughAgentName
        ) {
          continue;
        }

        if (part.state === "output-available") {
          setIsGeneratingWalkthrough(false);
          void refreshWalkthroughStatus();
        }

        return;
      }
    }
  }, [
    isGeneratingWalkthrough,
    messages,
    refreshWalkthroughStatus,
    walkthroughAgentName,
  ]);

  useEffect(() => {
    if (!isGeneratingWalkthrough) {
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      setIsGeneratingWalkthrough(false);
      void vscodeHost.showInformationMessage?.(
        t("walkthrough.timeout", {
          defaultValue: "Walkthrough generation timed out. Please try again.",
        }),
        { modal: false },
      );
    }, 30000);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [isGeneratingWalkthrough, t]);

  const handleCreateWalkthrough = useCallback(() => {
    console.log(
      "[Frontend] Create walkthrough button clicked, taskId:",
      taskId,
    );
    if (!taskId) {
      console.warn("[Frontend] No taskId available for walkthrough generation");
      return;
    }
    if (!walkthroughPath) {
      console.warn("[Frontend] No walkthrough path available");
      return;
    }
    if (!customAgent) {
      void vscodeHost.showInformationMessage?.(
        `Walkthrough agent "${walkthroughAgentName}" not found.`,
        { modal: false },
      );
      return;
    }

    if (!walkthroughBasePath) {
      console.warn(
        "[Frontend] No workspace base path available for walkthrough generation",
      );
      return;
    }

    setIsGeneratingWalkthrough(true);
    sendMessage({
      prompt: buildWalkthroughRequestMessage(taskId, walkthroughPath),
    });
  }, [
    taskId,
    walkthroughPath,
    walkthroughBasePath,
    customAgent,
    sendMessage,
    walkthroughAgentName,
  ]);

  const isLatestAttemptCompletion =
    toolCall.toolCallId === latestAttemptCompletionId;
  const isSubtask = Boolean(task?.parentId);

  const showWalkthrough =
    Boolean(result.trim()) &&
    !isExecuting &&
    !isLoading &&
    isLatestAttemptCompletion &&
    !isSubtask;
  const walkthroughLabel = hasExistingWalkthrough
    ? t("toolInvocation.updateWalkthrough")
    : t("toolInvocation.createWalkthrough");
  const generatingLabel = `${walkthroughLabel}...`;

  // Return null if there's nothing to display
  if (!result) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-2 font-bold text-emerald-700 text-sm dark:text-emerald-300">
        <Check className="size-4" />
        {t("toolInvocation.taskCompleted")}
      </span>
      <MessageMarkdown>{result}</MessageMarkdown>
      {showWalkthrough ? (
        <div className="flex gap-2">
          <Button
            className="self-start"
            size="sm"
            type="button"
            variant="outline"
            disabled={isGeneratingWalkthrough}
            onClick={handleCreateWalkthrough}
          >
            {isGeneratingWalkthrough ? generatingLabel : walkthroughLabel}
          </Button>
          {hasExistingWalkthrough && walkthroughPath ? (
            <Button
              className="self-start"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() =>
                vscodeHost.openFile(walkthroughPath, {
                  webviewKind: globalThis.POCHI_WEBVIEW_KIND,
                })
              }
            >
              {t("walkthrough.open")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export function buildWalkthroughRequestMessage(
  taskId: string,
  targetPath?: string,
) {
  const pathNote = targetPath ? ` Target path: \`${targetPath}\`.` : "";
  return `Walkthrough request for task \`${taskId}\`. Use \`newTask\` with agentType "walkthroughs".${pathNote}`;
}
