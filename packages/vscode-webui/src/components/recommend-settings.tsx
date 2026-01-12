import { useVSCodeSettings } from "@/lib/hooks/use-vscode-settings";
import { vscodeHost } from "@/lib/vscode";
import type { VSCodeSettings } from "@getpochi/common/vscode-webui-bridge";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Tooltip } from "./ui/tooltip";

type Options =
  | "enablePochiLayout"
  | "disableAutoSave"
  | "disableCommentsOpenView"
  | "disableGithubCopilotCodeCompletion";

const OptionsToSettingsKey = {
  enablePochiLayout: "pochi.advanced",
  disableAutoSave: "files.autoSave",
  disableCommentsOpenView: "comments.openView",
  disableGithubCopilotCodeCompletion: "github.copilot.enable",
};

function openSettingsLink(option: Options) {
  return encodeURI(
    `command:workbench.action.openSettings?["@id:${OptionsToSettingsKey[option]}"]`,
  );
}

export function RecommendSettings() {
  const { t } = useTranslation();
  const vscodeSettings = useVSCodeSettings();

  const options: { id: Options; checked: boolean }[] = useMemo(() => {
    return [
      {
        id: "enablePochiLayout",
        checked: !!vscodeSettings.pochiLayout?.enabled,
      },
      {
        id: "disableAutoSave",
        checked: !!vscodeSettings.autoSaveDisabled,
      },
      {
        id: "disableCommentsOpenView",
        checked: !!vscodeSettings.commentsOpenViewDisabled,
      },
      {
        id: "disableGithubCopilotCodeCompletion",
        checked: !vscodeSettings.githubCopilotCodeCompletionEnabled,
      },
    ];
  }, [vscodeSettings]);

  const onCheckedChange = useCallback(
    async (id: Options, checked: boolean) => {
      const params: Partial<VSCodeSettings> = {};
      switch (id) {
        case "enablePochiLayout":
          params.pochiLayout = {
            ...vscodeSettings.pochiLayout,
            enabled: checked,
          };
          break;
        case "disableAutoSave":
          params.autoSaveDisabled = checked;
          break;
        case "disableCommentsOpenView":
          params.commentsOpenViewDisabled = checked;
          break;
        case "disableGithubCopilotCodeCompletion":
          params.githubCopilotCodeCompletionEnabled = !checked;
          break;
      }
      await vscodeHost.updateVSCodeSettings(params);
    },
    [vscodeSettings],
  );

  const onConfirm = useCallback(async () => {
    await vscodeHost.updateVSCodeSettings({
      hideRecommendSettings: true,
    });
  }, []);

  return (
    <div className="mt-6 max-w-md rounded-lg border bg-muted p-4 text-left">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-medium text-base">
            {t("recommendSettings.title")}
          </h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={onConfirm}
            className="-mt-1 -mr-2"
          >
            {t("recommendSettings.hide")}
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          {options.map((option) => (
            <div key={option.id} className="flex items-center space-x-2">
              <Checkbox
                id={option.id}
                checked={option.checked}
                onCheckedChange={(checked) =>
                  onCheckedChange(option.id, !!checked)
                }
              />
              <Label
                htmlFor={option.id}
                className="cursor-pointer whitespace-nowrap font-normal text-base transition-colors"
              >
                <Tooltip>
                  <a
                    href={openSettingsLink(option.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="hover:text-primary">
                      {t(`recommendSettings.options.${option.id}`)}
                    </span>
                  </a>
                </Tooltip>
              </Label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
