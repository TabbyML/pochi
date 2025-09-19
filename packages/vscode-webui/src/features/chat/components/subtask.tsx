import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Message } from "@getpochi/livekit";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useCallback } from "react";
import { useSubtaskCompleted } from "../hooks/use-subtask-completed";
import type { SubtaskInfo } from "../hooks/use-subtask-info";

export const SubtaskHeader: React.FC<{
  subtask: SubtaskInfo;
}> = ({ subtask }) => {
  return (
    <>
      <div className="flex items-center border-gray-200/30 px-4 py-1">
        <Link
          to="/"
          search={{
            uid: subtask.parentUid,
          }}
          replace={true}
          viewTransition
        >
          <Button variant={"ghost"} size="sm" className="h-8 px-3">
            <ChevronLeft className="size-4" />
          </Button>
        </Link>
        <span className="ml-2 text-accent-foreground first-letter:capitalize">
          {subtask?.description ?? ""}
        </span>
      </div>
      <Separator className="mt-1 mb-2" />
    </>
  );
};

export const CompleteSubtaskButton: React.FC<{
  subtask: SubtaskInfo | undefined;
  messages: Message[];
}> = ({ subtask, messages }) => {
  const navigate = useNavigate();

  const subtaskCompleted = useSubtaskCompleted(subtask, messages);

  const onCompleteSubtask = useCallback(() => {
    if (!subtask || !subtaskCompleted) {
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
  }, [navigate, subtask, subtaskCompleted]);

  if (!subtask || !subtaskCompleted) {
    return null;
  }

  return (
    <Button className="flex-1 rounded-sm" onClick={onCompleteSubtask}>
      Complete Subtask
    </Button>
  );
};
