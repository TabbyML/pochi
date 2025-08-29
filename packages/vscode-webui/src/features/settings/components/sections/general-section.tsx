import { useTranslation } from "react-i18next";
import { LanguageSelectOption } from "../ui/language-select-option";
import { Section } from "../ui/section";

export const GeneralSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Section title={t("settings.general.title")}>
      <LanguageSelectOption
        id="language-select"
        label={t("settings.advanced.language")}
        description={t("settings.advanced.languageDescription")}
      />
    </Section>
  );
};
