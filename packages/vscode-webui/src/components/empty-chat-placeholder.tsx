import { useAutoSaveDisabled } from "@/lib/hooks/use-auto-save";
import { AlertTriangleIcon, ImageIcon, TerminalIcon } from "lucide-react";
import { Button } from "./ui/button";
import { useTranslation } from "react-i18next";

export function EmptyChatPlaceholder() {
  const autoSaveDisabled = useAutoSaveDisabled();
  const { t } = useTranslation();

  return (
    <div className="flex h-[80vh] select-none flex-col items-center justify-center p-5 text-center text-gray-500 dark:text-gray-300">
      <div className="mb-4">{/* Adjusted icon color for visibility */}</div>
      <h2 className="mb-2 flex items-center gap-3 font-semibold text-2xl text-gray-700 dark:text-gray-100">
        <TerminalIcon className="animate-[spin_6s_linear_infinite]" />
        {t("emptyChat.title")}
      </h2>
      <p className="mb-4 leading-relaxed">
        {t("emptyChat.subtitle")}
        <br />
        {t("emptyChat.disclaimer")}
      </p>
      <ul className="m-0 list-none p-0">
        <li className="mb-2 flex items-center">
          <ImageIcon className="mr-2 size-4" /> {t("emptyChat.tips.images")}
        </li>
        <li className="mb-2 flex items-center">
          <span className="mr-2 text-base">@</span>{" "}
          {t("emptyChat.tips.context")}
        </li>
        <li className="mb-2 flex items-center">
          <span className="mr-3 ml-1 text-base">/</span>{" "}
          {t("emptyChat.tips.workflow")}
        </li>
      </ul>
      {!autoSaveDisabled && (
        <div className="mt-6 max-w-md rounded-lg border bg-muted p-4 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <h3 className="items-center font-medium text-sm ">
                <AlertTriangleIcon className="mr-1 mb-[1px] inline size-4" />
                {t("emptyChat.autoSave.title")}
              </h3>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">
                {t("emptyChat.autoSave.description")}
              </p>
              <div className="mt-3">
                <a
                  href="command:workbench.action.toggleAutoSave"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="default">
                    {t("common.disable")}
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
