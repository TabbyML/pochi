import { useCustomAgent } from "@/lib/hooks/use-custom-agent";
import { vscodeHost } from "@/lib/vscode";
import type { CustomAgentFile } from "@getpochi/common/vscode-webui-bridge";
import { Bot, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptySectionPlaceholder, ScetionItem, Section } from "../ui/section";

export const CustomAgentSection: React.FC = () => {
  const { t } = useTranslation();
  const { data: customAgents, isLoading } = useCustomAgent();

  const handleEditAgent = (agent: CustomAgentFile) => {
    vscodeHost.openFile(agent.filePath);
  };

  const renderCustomAgentsContent = () => {
    if (isLoading) {
      return (
        <EmptySectionPlaceholder content={t("settings.customAgent.loading")} />
      );
    }

    if (customAgents.length === 0) {
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
    <Section title={t("settings.customAgent.title")}>
      {renderCustomAgentsContent()}
    </Section>
  );
};
