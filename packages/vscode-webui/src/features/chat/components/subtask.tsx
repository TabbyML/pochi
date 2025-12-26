import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { SubtaskInfo } from "../hooks/use-subtask-info";

export const SubtaskHeader: React.FC<{
  subtask: SubtaskInfo;
  className?: string;
}> = ({ subtask, className }) => {
  const { t } = useTranslation();

  return (
    <div className={cn("px-2 pb-0", className)}>
      <Link
        to="/task"
        search={{ uid: subtask.parentUid }}
        replace={true}
        className={cn(buttonVariants({ variant: "ghost" }), "gap-1")}
      >
        <ChevronLeft className="mr-1.5 size-4" /> {t("subtask.back")}
      </Link>
    </div>
  );
};

export const CompleteSubtaskButton: React.FC<{
  subtask: SubtaskInfo | undefined;
  showCompleteButton: boolean;
}> = ({ subtask, showCompleteButton }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const onCompleteSubtask = useCallback(() => {
    if (!subtask || !showCompleteButton) {
      return null;
    }
    navigate({
      to: "/task",
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
      {t("subtask.complete")}
    </Button>
  );
};
