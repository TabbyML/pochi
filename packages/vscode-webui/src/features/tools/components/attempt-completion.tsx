import { MessageMarkdown } from "@/components/message";
import { Button } from "@/components/ui/button";
import { useSendMessage } from "@/features/chat";
import { useCustomAgent } from "@/lib/hooks/use-custom-agents";
import { useWalkthroughPath } from "@/lib/hooks/use-walkthrough-path";
import {
  useDefaultStore,
  useDefaultStoreOptions,
} from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { WALKTHROUGH_AGENT_NAME } from "@getpochi/common";
import { catalog } from "@getpochi/livekit";
import { Check } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type { ToolProps } from "./types";

type AttemptCompletionLayoutProps = {
  completionLabel: string;
  result: string;
  footer?: ReactNode;
};

const AttemptCompletionLayout: React.FC<AttemptCompletionLayoutProps> = ({
  completionLabel,
  result,
  footer,
}) => {
  return (
    <div className="flex flex-col gap-3">
      <span className="flex items-center gap-2 font-bold text-emerald-700 text-sm dark:text-emerald-300">
        <Check className="size-4" />
        {completionLabel}
      </span>
      <MessageMarkdown>{result}</MessageMarkdown>
      {footer ?? null}
    </div>
  );
};

export const AttemptCompletionTool: React.FC<
  ToolProps<"attemptCompletion">
> = ({ tool: toolCall, isExecuting, isLoading, messages, taskId }) => {
  const { t } = useTranslation();
  const { result = "" } = toolCall.input || {};
  const completionLabel = t("toolInvocation.taskCompleted");
  const storeOptions = useDefaultStoreOptions();
  const hasDefaultStoreProvider = Boolean(storeOptions);

  if (!result) {
    return null;
  }

  if (!hasDefaultStoreProvider || !taskId) {
    return (
      <AttemptCompletionLayout
        completionLabel={completionLabel}
        result={result}
      />
    );
  }

  return (
    <AttemptCompletionWithStore
      completionLabel={completionLabel}
      isExecuting={isExecuting}
      isLoading={isLoading}
      messages={messages}
      result={result}
      taskId={taskId}
      toolCall={toolCall}
    />
  );
};

type AttemptCompletionWithStoreProps = {
  completionLabel: string;
  isExecuting: boolean;
  isLoading: boolean;
  messages: ToolProps<"attemptCompletion">["messages"];
  result: string;
  taskId: string;
  toolCall: ToolProps<"attemptCompletion">["tool"];
};

const AttemptCompletionWithStore: React.FC<AttemptCompletionWithStoreProps> = ({
  completionLabel,
  isExecuting,
  isLoading,
  messages,
  result,
  taskId,
  toolCall,
}) => {
  const { t } = useTranslation();
  const sendMessage = useSendMessage();
  const store = useDefaultStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(taskId));
  const walkthroughAgentName = WALKTHROUGH_AGENT_NAME;
  const { customAgent, isLoading: isWalkthroughAgentLoading } =
    useCustomAgent(walkthroughAgentName);

  const {
    walkthroughPath,
    walkthroughBasePath,
    hasExistingWalkthrough,
    refreshWalkthroughStatus,
  } = useWalkthroughPath(taskId);
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
  const [activeWalkthroughToolCallId, setActiveWalkthroughToolCallId] =
    useState<string | null>(null);
  const [previousWalkthroughToolCallId, setPreviousWalkthroughToolCallId] =
    useState<string | null>(null);
  const latestWalkthroughToolCall = useMemo(() => {
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

        return part;
      }
    }

    return undefined;
  }, [messages, walkthroughAgentName]);
  const resetWalkthroughGeneration = useCallback(() => {
    setIsGeneratingWalkthrough(false);
    setActiveWalkthroughToolCallId(null);
    setPreviousWalkthroughToolCallId(null);
  }, []);

  useEffect(() => {
    if (!isGeneratingWalkthrough) {
      return;
    }

    if (
      !latestWalkthroughToolCall ||
      latestWalkthroughToolCall.toolCallId === previousWalkthroughToolCallId ||
      latestWalkthroughToolCall.toolCallId === activeWalkthroughToolCallId
    ) {
      return;
    }

    setActiveWalkthroughToolCallId(latestWalkthroughToolCall.toolCallId);
    setPreviousWalkthroughToolCallId(null);
  }, [
    activeWalkthroughToolCallId,
    isGeneratingWalkthrough,
    latestWalkthroughToolCall,
    previousWalkthroughToolCallId,
  ]);

  useEffect(() => {
    if (
      !isGeneratingWalkthrough ||
      !activeWalkthroughToolCallId ||
      !latestWalkthroughToolCall ||
      latestWalkthroughToolCall.toolCallId !== activeWalkthroughToolCallId
    ) {
      return;
    }

    if (latestWalkthroughToolCall.state === "output-available") {
      resetWalkthroughGeneration();
      void refreshWalkthroughStatus();
      return;
    }

    if (latestWalkthroughToolCall.state === "output-error") {
      resetWalkthroughGeneration();
    }
  }, [
    activeWalkthroughToolCallId,
    isGeneratingWalkthrough,
    latestWalkthroughToolCall,
    refreshWalkthroughStatus,
    resetWalkthroughGeneration,
  ]);

  useEffect(() => {
    if (!isGeneratingWalkthrough) {
      return;
    }

    const timeoutId = globalThis.setTimeout(() => {
      resetWalkthroughGeneration();
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
  }, [isGeneratingWalkthrough, resetWalkthroughGeneration, t]);

  const handleCreateWalkthrough = useCallback(() => {
    console.log(
      "[Frontend] Create walkthrough button clicked, taskId:",
      taskId,
    );
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

    setPreviousWalkthroughToolCallId(
      latestWalkthroughToolCall?.toolCallId ?? null,
    );
    setActiveWalkthroughToolCallId(null);
    setIsGeneratingWalkthrough(true);
    sendMessage({
      prompt: buildWalkthroughRequestMessage(taskId, walkthroughPath),
    });
  }, [
    customAgent,
    latestWalkthroughToolCall?.toolCallId,
    sendMessage,
    taskId,
    walkthroughAgentName,
    walkthroughBasePath,
    walkthroughPath,
  ]);

  const isLatestAttemptCompletion =
    toolCall.toolCallId === latestAttemptCompletionId;
  const isSubtask = Boolean(task?.parentId);
  const hasResultContent = Boolean(result.trim());

  const showWalkthrough =
    hasResultContent &&
    !isExecuting &&
    !isLoading &&
    isLatestAttemptCompletion &&
    !isSubtask &&
    !isWalkthroughAgentLoading;

  const walkthroughLabel = hasExistingWalkthrough
    ? t("toolInvocation.updateWalkthrough")
    : t("toolInvocation.createWalkthrough");
  const generatingLabel = `${walkthroughLabel}...`;

  const footer = showWalkthrough ? (
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
  ) : undefined;

  return (
    <AttemptCompletionLayout
      completionLabel={completionLabel}
      result={result}
      footer={footer}
    />
  );
};

export function buildWalkthroughRequestMessage(
  taskId: string,
  targetPath?: string,
) {
  const pathNote = targetPath ? ` Target path: \`${targetPath}\`.` : "";
  return `Walkthrough request for task \`${taskId}\`. Use \`newTask\` with agentType "walkthroughs".${pathNote}`;
}
