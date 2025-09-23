import { ScrollArea } from "@/components/ui/scroll-area";
import { ExternalLink } from "lucide-react";
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
          <a
            href="https://docs.getpochi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="group"
            aria-label={`${t("settings.learnMore")}`}
          >
            <div className="mt-4 flex items-center justify-center gap-2 rounded-md border border-border py-1 transition-all duration-200 hover:border-accent-foreground/20 hover:bg-secondary">
              <span className="font-medium text-foreground text-sm transition-colors group-hover:text-accent-foreground">
                {t("settings.learnMore")}
              </span>
              <ExternalLink className="h-3 w-3 text-muted-foreground transition-colors group-hover:text-accent-foreground" />
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
