import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCustomAgents } from "@/lib/hooks/use-custom-agents";
import { vscodeHost } from "@/lib/vscode";
import type {
  CustomAgentFile,
  InvalidCustomAgentFile,
} from "@getpochi/common/vscode-webui-bridge";
import { isValidCustomAgentFile } from "@getpochi/common/vscode-webui-bridge";
import { AlertTriangle, Bot, Edit, Globe, Settings } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EmptySectionPlaceholder, Section, SectionItem } from "../ui/section";

const CustomAgentParseErrorMap: Record<
  InvalidCustomAgentFile["error"],
  | "settings.customAgents.errors.readError"
  | "settings.customAgents.errors.parseError"
  | "settings.customAgents.errors.validationError"
> = {
  readError: "settings.customAgents.errors.readError",
  parseError: "settings.customAgents.errors.parseError",
  validationError: "settings.customAgents.errors.validationError",
};

export const AgentSection: React.FC = () => {
  const { t } = useTranslation();
  const { customAgents = [], isLoading } = useCustomAgents();

  const customAgentsWithoutBuiltIn = useMemo(() => {
    return customAgents.filter((agent) => !agent.isBuiltIn);
  }, [customAgents]);

  const handleEditAgent = (agent: CustomAgentFile) => {
    vscodeHost.openFile(agent.filePath);
  };

  const openBrowserAgentSettings = () => {
    vscodeHost.openBrowserAgentSettingsPanel();
  };

  const renderCustomAgentsContent = () => {
    if (isLoading) {
      return (
        <EmptySectionPlaceholder content={t("settings.customAgents.loading")} />
      );
    }

    if (customAgentsWithoutBuiltIn.length === 0) {
      return null;
    }

    return (
      <div className="space-y-2">
        {customAgentsWithoutBuiltIn.map((agent) => {
          const isValid = isValidCustomAgentFile(agent);
          const subtitle = !isValid ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <AlertTriangle className="mr-1.5 inline-block size-3 text-yellow-700 dark:text-yellow-500" />
                  {t(CustomAgentParseErrorMap[agent.error])}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[calc(60vw)]">
                <span className="text-wrap break-words">{agent.message}</span>
              </TooltipContent>
            </Tooltip>
          ) : agent.model ? (
            <span>{agent.model}</span>
          ) : null;

          return (
            <SectionItem
              key={`${agent.name}-${agent.filePath}`}
              title={agent.name}
              subtitle={subtitle}
              icon={<Bot className="size-4" />}
              onClick={() => handleEditAgent(agent)}
              actions={[
                {
                  icon: <Edit className="size-3.5" />,
                  onClick: () => {
                    handleEditAgent(agent);
                  },
                },
              ]}
            />
          );
        })}
      </div>
    );
  };

  const renderBuiltInAgentsContent = () => {
    return (
      <SectionItem
        title={t("builtInAgentsSettings.browser")}
        icon={<Globe className="size-4" />}
        onClick={openBrowserAgentSettings}
        actions={[
          {
            icon: <Settings className="size-3.5" />,
            onClick: openBrowserAgentSettings,
          },
        ]}
      />
    );
  };

  return (
    <Section title={t("settings.customAgents.title")}>
      <div className="ml-1 flex flex-col gap-2">
        {renderCustomAgentsContent()}
        {renderBuiltInAgentsContent()}
      </div>
    </Section>
  );
};
