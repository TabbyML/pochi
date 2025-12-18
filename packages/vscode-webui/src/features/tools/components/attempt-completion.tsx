import { MessageMarkdown } from "@/components/message";
import { Button } from "@/components/ui/button";
import { useCurrentWorkspace } from "@/lib/hooks/use-current-workspace";
import { vscodeHost } from "@/lib/vscode";
import { useStore } from "@livestore/react";
import { Check, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ToolProps } from "./types";
import { useState } from "react";
import { ThreadAbortSignal } from "@quilted/threads";
// import { Route } from "@/routes/task"

export const AttemptCompletionTool: React.FC<
  ToolProps<"attemptCompletion">
> = ({ tool: toolCall, messages }) => {
  const { t } = useTranslation();
  const { result = "" } = toolCall.input || {};
  const { data: currentWorkspace } = useCurrentWorkspace();
  const { store } = useStore();
  
  const [isCreatingWalkthrough, setIsCreatingWalkthrough] = useState(false);

  const cwd = currentWorkspace?.cwd;
  
  // Return null if there's nothing to display
  if (!result) {
    return null;
  }

  const handleCreateWalkthrough = async () => {
    setIsCreatingWalkthrough(true);
    try {
      // Generate walkthrough markdown content
      const markdown = `# Task Walkthrough: ${toolCall.toolCallId}

      ## Summary

      ${result}

      ## Task Details

      - Task ID: ${toolCall.toolCallId}
      - Created: ${new Date().toISOString()}

      ## Changes Made

      ${messages
        .filter((m) => m.role === "assistant")
        .flatMap((m) => m.parts)
        .filter((p) => p.type.startsWith("tool-"))
        .map((p) => `- ${p.type}`)
        .join("\n") || "No tool calls recorded"}
      `;

      // Create directory and write file using bash command
      const command = `mkdir -p "${cwd}/pochi/walkthroughs" && cat > "${cwd}/pochi/walkthroughs/${toolCall.toolCallId}.md" << 'WALKTHROUGH_EOF'
${markdown}
WALKTHROUGH_EOF`;

      // Create an abort signal (can be empty for this use case)
      const abortController = new AbortController();
      const { output, error } = await vscodeHost.executeBashCommand(
        command,
        ThreadAbortSignal.serialize(abortController.signal),
      );

      if (error) {
        console.error("Failed to create walkthrough:", error);
        await vscodeHost.showInformationMessage(
          `Failed to create walkthrough: ${error}`,
          {},
        );
      } else {
        console.log("Walkthrough created successfully:", output);
        
        // In Storybook, the content is stored in window.__lastWalkthroughContent
        if (typeof window !== "undefined" && (window as any).__lastWalkthroughContent) {
          const walkthrough = (window as any).__lastWalkthroughContent;
          console.log(`\n📄 Walkthrough file: ${walkthrough.filePath}`);
          console.log("📝 Full content:");
          console.log(walkthrough.content);
        }
        
        await vscodeHost.showInformationMessage(
          `Walkthrough saved to pochi/walkthroughs/${toolCall.toolCallId}.md\n\nCheck browser console for file content`,
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
  }

  return (
    <div className="flex flex-col">
      <div className="flex justify-between items-center">
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
            <BookOpen className="size-3.5" />生成walkthrough文档
          </Button>
        </div>
      </div>
      <MessageMarkdown>{result}</MessageMarkdown>
    </div>
  );
};
