import { useTranslation } from "react-i18next";
import { useDevSettings } from "../../hooks/use-dev-settings";
import { AccordionSection } from "../ui/accordion-section";
import { SettingsCheckboxOption } from "../ui/settings-checkbox-option";

export const AdvancedSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const { isDevMode, setDevMode } = useDevSettings();

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
              setDevMode(!!checked);
            }}
          />
        )}
      </div>
    </AccordionSection>
  );
};
