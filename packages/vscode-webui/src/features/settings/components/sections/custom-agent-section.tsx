import { useCustomAgents } from "@/lib/hooks/use-custom-agents";
import { vscodeHost } from "@/lib/vscode";
import type { CustomAgentFile } from "@getpochi/common/vscode-webui-bridge";
import { Bot, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AccordionSection } from "../ui/accordion-section";
import { EmptySectionPlaceholder, ScetionItem } from "../ui/section";

export const CustomAgentSection: React.FC = () => {
  const { t } = useTranslation();
  const { customAgents = [], isLoading } = useCustomAgents();

  const handleEditAgent = (agent: CustomAgentFile) => {
    vscodeHost.openFile(agent.filePath);
  };

  const renderCustomAgentsContent = () => {
    if (isLoading) {
      return (
        <EmptySectionPlaceholder content={t("settings.customAgent.loading")} />
      );
    }

    if (!customAgents || customAgents.length === 0) {
      return (
        <EmptySectionPlaceholder
          content={
            <div className="space-y-2">
              <p>{t("settings.customAgent.empty.description")}</p>
              <p className="text-xs">{t("settings.customAgent.empty.hint")}</p>
            </div>
          }
        />
      );
    }

    return (
      <div className="space-y-2">
        {customAgents.map((agent) => (
          <ScetionItem
            key={`${agent.name}-${agent.filePath}`}
            title={agent.name}
            icon={<Bot className="size-4" />}
            onClick={() => handleEditAgent(agent)}
            actions={[
              {
                icon: <Settings className="size-3" />,
                onClick: () => {
                  handleEditAgent(agent);
                },
              },
            ]}
          />
        ))}
      </div>
    );
  };

  return (
    <AccordionSection
      localStorageKey="settings-custom-agent-section"
      title={t("settings.customAgent.title")}
      collapsable={customAgents.length > 3}
      defaultOpen={true}
    >
      {renderCustomAgentsContent()}
    </AccordionSection>
  );
};
