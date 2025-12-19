import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

interface RouterErrorBoundaryProps {
  error: Error;
}

export function RouterErrorBoundary({ error }: RouterErrorBoundaryProps) {
  const { t } = useTranslation();

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-4">
      <div className="flex max-w-md flex-col items-center text-center">
        <h1 className="flex flex-col items-center gap-2 tracking-tight">
          <span className="font-semibold text-2xl">
            {t("error.somethingWentWrong")}
          </span>
          <span className="mt-2 line-clamp-4 break-all text-muted-foreground text-sm italic">
            {error.message || String(error)}
          </span>
        </h1>
        <a
          href="command:workbench.action.reloadWindow"
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground shadow-lg transition-all hover:scale-105 hover:bg-primary/90 hover:shadow-xl"
        >
          <RefreshCw className="size-4" />
          {t("error.reloadWindow")}
        </a>
      </div>
    </div>
  );
}
