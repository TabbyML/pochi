import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "react-i18next";
import { AccountSection } from "./sections/account-section";
import { AdvancedSettingsSection } from "./sections/advanced-settings-section";
import { CustomAgentSection } from "./sections/custom-agent-section";
import { ModelSection } from "./sections/model-section";
import { ToolsSection } from "./sections/tools-section";
import { WorkflowsSection } from "./sections/workflows-section";
import { WorkspaceRulesSection } from "./sections/workspace-rules-section";

export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="container mx-auto h-screen max-w-6xl">
      <ScrollArea className="h-full p-4">
        <div className="space-y-1">
          <AccountSection />
          <a href="https://docs.getpochi.com">
            <div className="mt-6 flex justify-center rounded border py-1">
              <span className="text-[var(--vscode-textLink-foreground)] text-sm">
                {t("settings.learnMore")}
              </span>
            </div>
          </a>
          <WorkspaceRulesSection />
          <CustomAgentSection />
          <WorkflowsSection />
          <ToolsSection />
          <ModelSection />
          <AdvancedSettingsSection />
        </div>
      </ScrollArea>
    </div>
  );
}
