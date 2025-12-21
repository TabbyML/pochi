import { MessageMarkdown } from "@/components/message";
import { Button } from "@/components/ui/button";
import { useSelectedModels } from "@/features/settings";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { vscodeHost } from "@/lib/vscode";
import { catalog, createModel, generateWalkthrough } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import { ThreadAbortSignal } from "@quilted/threads";
import { useRouter } from "@tanstack/react-router";
import { BookOpen, Check } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLiveChatKitGetters } from "../../chat/lib/use-live-chat-kit-getters";
import type { ToolProps } from "./types";

const GENERATE_WALKTHROUGH_TEXT = "Generate Walkthrough";

export const AttemptCompletionTool: React.FC<
  ToolProps<"attemptCompletion">
> = ({ tool: toolCall, messages }) => {
  const { t } = useTranslation();
  const { result = "" } = toolCall.input || {};
  const { data: currentWorkspace } = useCurrentWorkspace();
  const { store } = useStore();
  const router = useRouter();
  const searchParams = router.state.location.search as { uid?: string };
  const taskId = searchParams?.uid || toolCall.toolCallId;

  // Get task info to determine if it's a subtask
  const task = taskId
    ? store.useQuery(catalog.queries.makeTaskQuery(taskId))
    : undefined;
  const isSubTask = !!task?.parentId;

  // Get selected model to check availability
  const { selectedModel } = useSelectedModels({ isSubTask });

  // Use useLiveChatKitGetters to get LLM, which handles all model types correctly
  const todosRef = useRef(undefined);
  const getters = useLiveChatKitGetters({
    todos: todosRef,
    isSubTask,
  });

  const [isCreatingWalkthrough, setIsCreatingWalkthrough] = useState(false);

  const cwd = currentWorkspace?.cwd;

  // Return null if there's nothing to display
  if (!result) {
    return null;
  }

  const handleCreateWalkthrough = async () => {
    setIsCreatingWalkthrough(true);
    try {
      // Check if model is selected first
      if (!selectedModel) {
        await vscodeHost.showInformationMessage(
          "No model selected. Please select a model first.",
          {},
        );
        setIsCreatingWalkthrough(false);
        return;
      }

      // Get LLM from getters, which handles all model types correctly
      const llm = getters.getLLM();
      if (!llm) {
        console.error(
          "getLLM returned undefined even though selectedModel exists",
          {
            selectedModel,
            isSubTask,
          },
        );
        await vscodeHost.showInformationMessage(
          "Failed to initialize model. Please try again.",
          {},
        );
        setIsCreatingWalkthrough(false);
        return;
      }

      // Extract getModel from LLMRequestData
      // For vendor type, use the getModel function directly
      // For other types, use createModel to create the model
      const getModel =
        llm.type === "vendor" ? llm.getModel : () => createModel({ llm });

      // Generate walkthrough using LLM
      const walkthroughMarkdown = await generateWalkthrough({
        store,
        taskId,
        messages,
        getModel,
        abortSignal: undefined,
      });

      if (!walkthroughMarkdown) {
        await vscodeHost.showInformationMessage(
          "Failed to generate walkthrough content",
          {},
        );
        setIsCreatingWalkthrough(false);
        return;
      }

      // Write file using writeToFile tool
      const relativePath = `pochi/walkthroughs/${toolCall.toolCallId}.md`;
      const filePath = `${cwd}/${relativePath}`;

      try {
        // Use writeToFile tool to write the file (it automatically creates directories)
        const result = await vscodeHost.executeToolCall(
          "writeToFile",
          {
            path: relativePath,
            content: walkthroughMarkdown,
          },
          {
            toolCallId: `walkthrough-${toolCall.toolCallId}`,
            abortSignal: ThreadAbortSignal.serialize(new AbortController().signal),
          },
        ) as { success: boolean; error?: string };

        if (result.success) {
          console.log("Walkthrough created successfully");
          console.log(`📄 Walkthrough file saved to: ${filePath}`);
          console.log(`📄 Full path: ${filePath}`);
          console.log(`📄 Relative to workspace: ${relativePath}`);

          // Open the file in VSCode
          try {
            await vscodeHost.openFile(relativePath, {
              webviewKind: globalThis.POCHI_WEBVIEW_KIND,
            });
          } catch (openError) {
            console.warn("Failed to open file:", openError);
            // Try with absolute path if relative path fails
            try {
              await vscodeHost.openFile(filePath, {
                webviewKind: globalThis.POCHI_WEBVIEW_KIND,
              });
            } catch (absError) {
              console.warn("Failed to open file with absolute path:", absError);
            }
          }

          const message = `✅ Walkthrough saved successfully!

📁 File location: ${relativePath}
📁 Full path: ${filePath}

The file should open automatically in the editor. If not, you can find it in your workspace under the "pochi/walkthroughs" folder.`;

          await vscodeHost.showInformationMessage(message, {});
        } else {
          throw new Error(result.error || "Failed to write file");
        }
      } catch (fileError) {
        console.error("Failed to create walkthrough:", fileError);
        await vscodeHost.showInformationMessage(
          `Failed to create walkthrough: ${fileError instanceof Error ? fileError.message : String(fileError)}`,
          {},
        );
      }
    } catch (error) {
      console.error("Error creating walkthrough:", error);
      await vscodeHost.showInformationMessage(
        `Error creating walkthrough: ${error instanceof Error ? error.message : String(error)}`,
        {},
      );
    }
    setIsCreatingWalkthrough(false);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-bold text-emerald-700 text-sm dark:text-emerald-300">
          <Check className="size-4" />
          {t("toolInvocation.taskCompleted")}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            className="h-6 gap-1.5"
            onClick={handleCreateWalkthrough}
            disabled={!toolCall.toolCallId || isCreatingWalkthrough}
          >
            <BookOpen className="size-3.5" />
            {GENERATE_WALKTHROUGH_TEXT}
          </Button>
        </div>
      </div>
      <MessageMarkdown>{result}</MessageMarkdown>
    </div>
  );
};
