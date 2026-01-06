import { useVSCodeSettings } from "@/lib/hooks/use-vscode-settings";
import { vscodeHost } from "@/lib/vscode";
import type { VSCodeSettings } from "@getpochi/common/vscode-webui-bridge";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Tooltip } from "./ui/tooltip";

type Options =
  | "enablePochiLayoutKeybinding"
  | "pochiLayoutMoveBottomPanelViews"
  | "disableAutoSave"
  | "disableCommentsOpenView"
  | "disableGithubCopilotCodeCompletion";

const OptionsToSettingsKey = {
  enablePochiLayoutKeybinding: "pochi.advanced",
  pochiLayoutMoveBottomPanelViews: "pochi.advanced",
  disableAutoSave: "files.autoSave",
  disableCommentsOpenView: "comments.openView",
  disableGithubCopilotCodeCompletion: "github.copilot.enable",
};

function openSettingsLink(option: Options) {
  return encodeURI(
    `command:workbench.action.openSettings?["@id:${OptionsToSettingsKey[option]}"]`,
  );
}

const OpenKeybindingLink = "(Ctrl/Cmd+L)";

function openKeybindingLink() {
  const commandId = "pochi.applyPochiLayoutWithCycleFocus";
  return encodeURI(
    `command:workbench.action.openGlobalKeybindings?["${commandId}"]`,
  );
}

export function RecommendSettings() {
  const { t } = useTranslation();
  const vscodeSettings = useVSCodeSettings();
  const options = useMemo(() => {
    const list = [] as Options[];
    if (!vscodeSettings.pochiLayout?.keybindingEnabled) {
      list.push("enablePochiLayoutKeybinding");
    }
    if (!vscodeSettings.pochiLayout?.moveBottomPanelViews) {
      list.push("pochiLayoutMoveBottomPanelViews");
    }
    if (!vscodeSettings.autoSaveDisabled) {
      list.push("disableAutoSave");
    }
    if (!vscodeSettings.commentsOpenViewDisabled) {
      list.push("disableCommentsOpenView");
    }
    if (vscodeSettings.githubCopilotCodeCompletionEnabled) {
      list.push("disableGithubCopilotCodeCompletion");
    }
    return list;
  }, [vscodeSettings]);

  useEffect(() => {
    if (!vscodeSettings.recommendSettingsConfirmed && options.length === 0) {
      vscodeHost.updateVSCodeSettings({ recommendSettingsConfirmed: true });
    }
  }, [vscodeSettings.recommendSettingsConfirmed, options]);

  const [selected, setSelected] = useState<Options[]>(options);

  const onCheckedChange = useCallback((id: Options, checked: boolean) => {
    setSelected((prev) => {
      if (checked) {
        return [...prev, id];
      }
      return prev.filter((item) => item !== id);
    });
  }, []);

  const onConfirm = useCallback(async () => {
    const params: Partial<VSCodeSettings> = {
      recommendSettingsConfirmed: true,
    };
    if (selected.includes("enablePochiLayoutKeybinding")) {
      params.pochiLayout = {
        ...params.pochiLayout,
        keybindingEnabled: true,
      };
    }
    if (selected.includes("pochiLayoutMoveBottomPanelViews")) {
      params.pochiLayout = {
        ...params.pochiLayout,
        moveBottomPanelViews: true,
      };
    }
    if (selected.includes("disableAutoSave")) {
      params.autoSaveDisabled = true;
    }
    if (selected.includes("disableCommentsOpenView")) {
      params.commentsOpenViewDisabled = true;
    }
    if (selected.includes("disableGithubCopilotCodeCompletion")) {
      params.githubCopilotCodeCompletionEnabled = false;
    }
    await vscodeHost.updateVSCodeSettings(params);
  }, [selected]);

  if (options.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 max-w-md rounded-lg border bg-muted p-4 text-left">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <h3 className="flex items-end font-medium text-base">
            {t("recommendSettings.title")}
          </h3>
        </div>
        <div className="flex flex-col gap-3">
          {options.map((option) => (
            <div key={option} className="flex items-center space-x-2">
              <Checkbox
                id={option}
                checked={selected.includes(option)}
                onCheckedChange={(checked) =>
                  onCheckedChange(option, !!checked)
                }
              />
              <Label
                htmlFor={option}
                className="cursor-pointer whitespace-nowrap font-normal text-base transition-colors"
              >
                <Tooltip>
                  <a
                    href={openSettingsLink(option)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="hover:text-primary">
                      {t(`recommendSettings.options.${option}`)}
                    </span>
                  </a>
                </Tooltip>
                {option === "enablePochiLayoutKeybinding" && (
                  <a
                    href={openKeybindingLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="hover:text-primary">
                      {OpenKeybindingLink}
                    </span>
                  </a>
                )}
              </Label>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-center">
          <Button size="sm" variant="default" onClick={onConfirm}>
            {t("recommendSettings.ok")}
          </Button>
        </div>
      </div>
    </div>
  );
}
