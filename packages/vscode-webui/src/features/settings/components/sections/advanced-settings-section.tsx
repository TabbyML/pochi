import { Button } from "@/components/ui/button";
import { useReviewPlanTutorialCounter } from "@/lib/hooks/use-review-plan-tutorial-counter";
import { useVSCodeSettings } from "@/lib/hooks/use-vscode-settings";
import { vscodeHost } from "@/lib/vscode";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../store";
import { AccordionSection } from "../ui/accordion-section";
import { SettingsCheckboxOption } from "../ui/settings-checkbox-option";

export const AdvancedSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const { isDevMode, updateIsDevMode } = useSettingsStore();
  const vscodeSettings = useVSCodeSettings();
  const { resetCount } = useReviewPlanTutorialCounter();

  return (
    <AccordionSection
      title={t("settings.advanced.title")}
      localStorageKey="advanced-settings-section"
    >
      <div className="flex flex-col gap-4 px-6">
        {isDevMode !== undefined && (
          <SettingsCheckboxOption
            id="dev-mode"
            label={t("settings.advanced.developerMode")}
            checked={isDevMode}
            onCheckedChange={(checked) => {
              updateIsDevMode(!!checked);
            }}
          />
        )}
        {isDevMode && (
          <>
            {vscodeSettings?.hideRecommendSettings && (
              <div>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await vscodeHost.updateVSCodeSettings({
                      hideRecommendSettings: false,
                    });
                  }}
                >
                  {t("settings.advanced.resetRecommendSettings")}
                </Button>
              </div>
            )}
            <div>
              <Button
                variant="destructive"
                onClick={async () => {
                  const opfsRoot = await navigator.storage.getDirectory();
                  if (
                    "remove" in opfsRoot &&
                    typeof opfsRoot.remove === "function"
                  ) {
                    await opfsRoot.remove();
                  }
                }}
              >
                {t("settings.advanced.clearStorage")}
              </Button>
            </div>
            <div>
              <Button variant="default" onClick={resetCount}>
                {t("settings.advanced.resetReviewPlanTutorialCounter")}
              </Button>
            </div>
          </>
        )}
      </div>
    </AccordionSection>
  );
};
