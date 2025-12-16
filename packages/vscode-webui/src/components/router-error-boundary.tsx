import { AlertCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface RouterErrorBoundaryProps {
  error: Error;
}

export function RouterErrorBoundary({ error }: RouterErrorBoundaryProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-4">
      <div className="flex max-w-md flex-col items-center text-center">
        <h1 className="mb-8 flex items-center gap-2 font-semibold text-2xl tracking-tight">
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertCircle
                className="size-5 shrink-0 cursor-help text-yellow-500"
                strokeWidth={2}
              />
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-md whitespace-pre-wrap break-words"
            >
              {error.message || String(error)}
            </TooltipContent>
          </Tooltip>
          <span>{t("error.somethingWentWrong")}</span>
        </h1>
        <a
          href="command:workbench.action.reloadWindow"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground shadow-lg transition-all hover:scale-105 hover:bg-primary/90 hover:shadow-xl"
        >
          <RefreshCw className="size-4" />
          {t("error.reloadWindow")}
        </a>
      </div>
    </div>
  );
}
