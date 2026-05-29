import { ScrollArea } from "@/components/ui/scroll-area";
import { useSettingsStore } from "../store";
import { AccountSection } from "./sections/account-section";
import { AdvancedSettingsSection } from "./sections/advanced-settings-section";
import { AgentSection } from "./sections/agent-section";
import { DeveloperSettingsSection } from "./sections/developer-settings-section";
import { ModelSection } from "./sections/model-section";
import { SkillSection } from "./sections/skill-section";
import { ToolsSection } from "./sections/tools-section";
import { WorkspaceRulesSection } from "./sections/workspace-rules-section";

export function SettingsPage() {
  const { isDevMode } = useSettingsStore();

  return (
    <div className="container mx-auto h-screen max-w-6xl">
      <ScrollArea className="h-full p-4">
        <div className="space-y-1">
          <AccountSection />
          <WorkspaceRulesSection />
          <AgentSection />
          <SkillSection />
          <ToolsSection />
          <ModelSection />
          <AdvancedSettingsSection />
          {isDevMode && <DeveloperSettingsSection />}
        </div>
      </ScrollArea>
    </div>
  );
}
