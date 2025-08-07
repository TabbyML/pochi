import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient, authHooks } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  type ExternalIntegrationsEvent,
  createExternalIntegrationsEventSourceWithApiClient,
} from "@ragdoll/server";
import { getServerBaseUrl } from "@ragdoll/vscode-webui-bridge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { Dot } from "lucide-react";
import { useEffect } from "react";
import { Section, SubSection } from "../ui/section";
import { ToolBadgeList } from "../ui/tool-badge";
import { McpSection } from "./mcp-section";

interface Tool {
  id: string;
  description: string;
}

export const ToolsSection: React.FC = () => {
  const queryClient = useQueryClient();
  const { session } = authHooks.useSession();
  const userId = session?.userId;

  const { data: toolsData, isLoading } = useQuery({
    queryKey: ["tools"],
    queryFn: async () => {
      const res = await apiClient.api.tools.$get();
      if (!res.ok) {
        throw new Error("Failed to fetch available tools");
      }
      return res.json() as Promise<Tool[]>;
    },
  });

  const { data: connectedIntegrationsData } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const res = await apiClient.api.integrations.$get();
      if (!res.ok) {
        throw new Error("Failed to fetch integration status");
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (!userId) return;
    const es = createExternalIntegrationsEventSourceWithApiClient(apiClient);
    const unsubscribe = es.subscribe(
      "integrations:changed",
      (event: ExternalIntegrationsEvent) => {
        if (event?.data?.userId === userId)
          queryClient.invalidateQueries({ queryKey: ["integrations"] });
      },
    );

    return () => {
      unsubscribe();
      es.dispose();
    };
  }, [queryClient, userId]);

  const renderToolsContent = () => {
    if (!toolsData || isLoading) {
      return (
        <div className="flex flex-wrap gap-2">
          {new Array(12).fill(null).map((_, i) => {
            const randomWidth = (Math.floor(Math.random() * 20) + 10) * 0.3;
            return (
              <Skeleton
                key={i}
                style={{
                  width: `${randomWidth}rem`,
                }}
                className="h-6 bg-secondary"
              />
            );
          })}
        </div>
      );
    }

    return <ToolBadgeList tools={toolsData} />;
  };

  const titleElement = (
    <a href={`${getServerBaseUrl()}/profile`}>Integrations</a>
  );

  return (
    <Section title="Tools">
      <div className="flex flex-col gap-6">
        <McpSection />

        {false && (
          <SubSection title={titleElement}>
            <Connections integrations={connectedIntegrationsData || []} />
          </SubSection>
        )}

        <SubSection title="BUILT-IN">{renderToolsContent()}</SubSection>
      </div>
    </Section>
  );
};

interface IntegrationDisplayConfig {
  provider: string;
  displayName: string;
  capabilities: string[];
}

const integrationDisplayConfigs: IntegrationDisplayConfig[] = [
  {
    provider: "github",
    displayName: "GitHub",
    capabilities: ["issue", "pr", "repository"],
  },
];

const Connections: React.FC<{
  integrations: InferResponseType<typeof apiClient.api.integrations.$get>;
}> = ({ integrations }) => {
  return (
    <div className="w-full">
      <div className="space-y-2">
        {integrationDisplayConfigs.map((config) => {
          const isConnected = !!integrations?.find(
            (i) => i.provider === config.provider,
          );
          return (
            <div
              key={config.provider}
              className="flex justify-between rounded-md border px-2 py-2"
            >
              <span className="flex items-center font-semibold">
                <Dot
                  className={cn("size-6 shrink-0", {
                    "text-success": isConnected,
                    "text-muted-foreground": !isConnected,
                  })}
                />
                {config.displayName}
              </span>
              {config.capabilities.length > 0 && (
                <span className="flex flex-nowrap items-center gap-2 truncate">
                  {config.capabilities.map((capability) => (
                    <Badge
                      key={capability}
                      className="bg-accent text-accent-foreground"
                    >
                      {capability}
                    </Badge>
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
