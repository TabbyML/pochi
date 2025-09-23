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
import { AlertTriangle, Bot, Edit } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AccordionSection } from "../ui/accordion-section";
import { EmptySectionPlaceholder, SectionItem } from "../ui/section";

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

export const CustomAgentSection: React.FC = () => {
  const { t } = useTranslation();
  const { customAgents = [], isLoading } = useCustomAgents();

  const handleEditAgent = (agent: CustomAgentFile) => {
    vscodeHost.openFile(agent.filePath);
  };

  const renderCustomAgentsContent = () => {
    if (isLoading) {
      return (
        <EmptySectionPlaceholder content={t("settings.customAgents.loading")} />
      );
    }

    if (!customAgents || customAgents.length === 0) {
      return (
        <EmptySectionPlaceholder
          content={
            <div className="space-y-2">
              <p className="text-xs">{t("settings.customAgents.empty")}</p>
            </div>
          }
        />
      );
    }

    return (
      <div className="space-y-2">
        {customAgents.map((agent) => {
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

  return (
    <AccordionSection
      localStorageKey="settings-custom-agent-section"
      title={t("settings.customAgents.title")}
      collapsable={customAgents.length > 3}
      defaultOpen={true}
    >
      {renderCustomAgentsContent()}
    </AccordionSection>
  );
};
