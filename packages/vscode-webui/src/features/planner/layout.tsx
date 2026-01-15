import { MessageMarkdown as Markdown } from "@/components/message/markdown";
import { Button } from "@/components/ui/button";
import {
  ChatArea,
  ChatToolbar,
  type SubtaskInfo,
  useSendMessage,
} from "@/features/chat";
import { useDefaultStore } from "@/lib/use-default-store";

import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { catalog } from "@getpochi/livekit";
import { Edit, FileText, Play } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface PlannerLayoutProps {
  chatAreaProps: React.ComponentProps<typeof ChatArea>;
  chatToolbarProps: React.ComponentProps<typeof ChatToolbar>;
  subtask?: SubtaskInfo;
  uid: string;
}

export function PlannerLayout({
  chatAreaProps,
  chatToolbarProps,
  uid,
}: PlannerLayoutProps) {
  const { t } = useTranslation();
  const store = useDefaultStore();
  const sendMessage = useSendMessage();

  const planFile = store.useQuery(
    catalog.queries.makeFileQuery(uid, "/plan.md"),
  );

  // Resizing logic
  const [leftWidth, setLeftWidth] = useState(50); // Percentage
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  const startResizing = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const stopResizing = useCallback(() => {
    isResizing.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing.current && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const newLeftWidth =
        ((e.clientX - containerRect.left) / containerRect.width) * 100;
      // Limit width between 20% and 80%
      if (newLeftWidth > 20 && newLeftWidth < 80) {
        setLeftWidth(newLeftWidth);
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  const handleEditPlan = () => {
    vscodeHost.openFile(`pochi://${uid}/plan.md`);
  };

  const handleExecutePlan = () => {
    sendMessage({
      prompt: t("planner.executePrompt"),
    });
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      {/* Main Content Area: Split View */}
      <div className="flex flex-1 overflow-hidden" ref={containerRef}>
        {/* Left Pane: Chat Messages */}
        <div
          style={{ width: `${leftWidth}%` }}
          className="flex flex-col border-border border-r"
        >
          <div className="relative flex flex-1 flex-col overflow-hidden">
            <ChatArea
              {...chatAreaProps}
              className={cn(chatAreaProps.className, "pb-4")}
            />
          </div>
        </div>

        {/* Resizer Handle */}
        <div
          className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/50"
          onMouseDown={startResizing}
        />

        {/* Right Pane: Plan Preview */}
        <div className="flex flex-1 flex-col overflow-hidden bg-muted/10">
          {/* Card Header */}
          <div className="flex h-10 shrink-0 items-center justify-between border-border border-b bg-background px-4">
            <div className="flex items-center gap-2 font-medium text-sm">
              <FileText className="size-4 text-muted-foreground" />
              <span>{t("planner.plan")}</span>
            </div>
          </div>

          {/* Card Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {planFile?.content ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Markdown>{planFile.content}</Markdown>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <FileText className="mb-2 size-8 opacity-20" />
                <p className="text-sm">
                  {t("planner.noPlanYet", "No plan generated yet.")}
                </p>
              </div>
            )}
          </div>

          {/* Card Actions (Footer) */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-border border-t bg-background p-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={handleEditPlan}
              disabled={!planFile?.content}
            >
              <Edit className="size-3.5" />
              {t("planner.editPlan", "Edit Plan")}
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={handleExecutePlan}
              disabled={!planFile?.content}
            >
              <Play className="size-3.5" />
              {t("planner.executePlan", "Execute Plan")}
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom Area: Input Toolbar */}
      <div className="shrink-0 border-border border-t bg-background p-4">
        <div className="w-full">
          <ChatToolbar {...chatToolbarProps} />
        </div>
      </div>
    </div>
  );
}
