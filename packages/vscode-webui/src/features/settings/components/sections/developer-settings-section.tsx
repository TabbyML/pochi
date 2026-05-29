import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useDevSettings } from "../../hooks/use-dev-settings";
import { AccordionSection } from "../ui/accordion-section";

export const DeveloperSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const {
    showResetRecommendBtn,
    resetRecommendSettings,
    clearOPFSStorage,
    resetTutorialCount,
  } = useDevSettings();

  return (
    <AccordionSection
      title={t("settings.advanced.developerSettings")}
      localStorageKey="developer-settings-section"
    >
      <div className="flex flex-col gap-4 px-6 py-2">
        {showResetRecommendBtn && (
          <div className="flex items-center justify-between border-border border-b pb-4 last:border-0 last:pb-0">
            <span className="font-semibold text-sm">
              {t("settings.advanced.resetRecommendSettings")}
            </span>
            <Button
              variant="default"
              size="sm"
              onClick={resetRecommendSettings}
            >
              {t("common.reset")}
            </Button>
          </div>
        )}
        <div className="flex items-center justify-between border-border border-b pb-4 last:border-0 last:pb-0">
          <span className="font-semibold text-sm">
            {t("settings.advanced.clearStorage")}
          </span>
          <Button variant="default" size="sm" onClick={clearOPFSStorage}>
            {t("common.clear")}
          </Button>
        </div>
        <div className="flex items-center justify-between border-border border-b pb-4 last:border-0 last:pb-0">
          <span className="font-semibold text-sm">
            {t("settings.advanced.resetReviewPlanTutorialCounter")}
          </span>
          <Button variant="default" size="sm" onClick={resetTutorialCount}>
            {t("common.reset")}
          </Button>
        </div>
      </div>
    </AccordionSection>
  );
};
