import { ScrollArea } from "@/components/ui/scroll-area";
import type { User } from "@/lib/auth-client";
import { AccountSection } from "./sections/account-section";
import { AdvancedSettingsSection } from "./sections/advanced-settings-section";
import { ModelSection } from "./sections/model-section";
import { ToolsSection } from "./sections/tools-section";
import { WorkflowsSection } from "./sections/workflows-section";
import { WorkspaceRulesSection } from "./sections/workspace-rules-section";

export function SettingsPage({ user }: { user?: User }) {
  return (
    <div className="container mx-auto h-screen max-w-6xl">
      <ScrollArea className="h-full p-4">
        <div className="space-y-1">
          <AccountSection user={user} />
          <WorkspaceRulesSection />
          <WorkflowsSection />
          <ToolsSection />
          <ModelSection user={user} />
          {/* <CustomAgentSection /> */}
          <AdvancedSettingsSection />
        </div>
      </ScrollArea>
    </div>
  );
}
