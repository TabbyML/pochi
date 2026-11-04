import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SendToBack } from "lucide-react";
import { useTranslation } from "react-i18next";

export function MoveToBackgroundButton({
  onMoveToBackground,
}: { onMoveToBackground: () => void }) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0 self-start text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onMoveToBackground();
          }}
        >
          <SendToBack className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-60">
        <p className="font-medium">{t("backgroundTasks.moveToBackground")}</p>
        <p className="text-muted-foreground">
          {t("backgroundTasks.moveToBackgroundHint")}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
