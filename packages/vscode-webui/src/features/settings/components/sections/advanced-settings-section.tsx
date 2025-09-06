import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../store";
import { AccordionSection } from "../ui/accordion-section";
import { SettingsCheckboxOption } from "../ui/settings-checkbox-option";

export const AdvancedSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const {
    isDevMode,
    updateIsDevMode,

    enablePochiModels,
    updateEnablePochiModels,
  } = useSettingsStore();

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
            <SettingsCheckboxOption
              id="enable-pochi-models"
              label={t("settings.advanced.enablePochiModels")}
              checked={enablePochiModels}
              onCheckedChange={(checked) => {
                updateEnablePochiModels(!!checked);
              }}
            />
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
          </>
        )}
      </div>
    </AccordionSection>
  );
};
