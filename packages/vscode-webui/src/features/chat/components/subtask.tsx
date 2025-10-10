import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Message } from "@getpochi/livekit";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useCallback } from "react";
import { useShowCompleteSubtaskButton } from "../hooks/use-subtask-completed";
import type { SubtaskInfo } from "../hooks/use-subtask-info";

export const SubtaskHeader: React.FC<{
  subtask: SubtaskInfo;
  className?: string;
}> = ({ subtask, className }) => {
  return (
    <div className={cn("px-2 pb-0", className)}>
      <Link
        to="/"
        search={{ uid: subtask.parentUid }}
        replace={true}
        className={cn(buttonVariants({ variant: "ghost" }), "gap-1")}
      >
        <ChevronLeft className="mr-1.5 size-4" /> Back
      </Link>
    </div>
  );
};

export const CompleteSubtaskButton: React.FC<{
  subtask: SubtaskInfo | undefined;
  messages: Message[];
}> = ({ subtask, messages }) => {
  const navigate = useNavigate();

  const showCompleteButton = useShowCompleteSubtaskButton(subtask, messages);

  const onCompleteSubtask = useCallback(() => {
    if (!subtask || !showCompleteButton) {
      return null;
    }
    navigate({
      to: "/",
      search: {
        uid: subtask.parentUid,
      },
      replace: true,
      viewTransition: true,
    });
  }, [navigate, subtask, showCompleteButton]);

  if (!subtask || !showCompleteButton) {
    return null;
  }

  return (
    <Button className="flex-1 rounded-sm" onClick={onCompleteSubtask}>
      Complete
    </Button>
  );
};
