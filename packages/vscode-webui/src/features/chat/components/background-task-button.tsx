import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getSubAgentBackgroundJobId } from "@getpochi/common";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { FixedStateChatContextProvider } from "../lib/chat-state/fixed-state";
import { BackgroundTaskDetail } from "./background-task-debug-panel";

/** Inspect a subagent without unmounting the page that owns its executor. */
export function BackgroundTaskButton({
  taskId,
  children,
  className,
}: {
  taskId: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn("cursor-pointer hover:underline", className)}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </button>
      </SheetTrigger>
      <SheetContent
        className="flex h-full w-[420px] max-w-[90vw] flex-col p-0 pt-8"
        aria-describedby={undefined}
      >
        <SheetTitle className="sr-only">
          {t("backgroundTasks.title")}
        </SheetTitle>
        <FixedStateChatContextProvider>
          <BackgroundTaskDetail
            taskId={taskId}
            backgroundJobId={getSubAgentBackgroundJobId(taskId)}
            showDiagnostics={false}
            onBack={() => setOpen(false)}
          />
        </FixedStateChatContextProvider>
      </SheetContent>
    </Sheet>
  );
}
