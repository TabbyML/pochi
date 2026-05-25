import { vscodeHost } from "@/lib/vscode";
import { Bot, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SectionItem, SubSection } from "../ui/section";

export const BuiltInAgentSection: React.FC = () => {
  const { t } = useTranslation();

  const openBrowserAgentSettings = () => {
    vscodeHost.openBrowserAgentSettingsPanel();
  };

  return (
    <SubSection title={t("builtInAgentsSettings.title")}>
      <SectionItem
        title={t("builtInAgentsSettings.browser")}
        icon={<Bot className="size-4" />}
        onClick={openBrowserAgentSettings}
        actions={[
          {
            icon: <Settings className="size-3.5" />,
            onClick: openBrowserAgentSettings,
          },
        ]}
      />
    </SubSection>
  );
};
