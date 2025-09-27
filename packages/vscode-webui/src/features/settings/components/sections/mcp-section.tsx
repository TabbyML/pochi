import { FileIcon } from "@/components/tool-invocation/file-icon/file-icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMcp } from "@/lib/hooks/use-mcp";
import { cn } from "@/lib/utils";
import { getFileName } from "@/lib/utils/file";
import { vscodeHost } from "@/lib/vscode";
import type { McpServerConnection } from "@getpochi/common/mcp-utils";
import {
  ChevronsUpDown,
  Dot,
  Download,
  Edit,
  Github,
  PencilIcon,
  RotateCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptySectionPlaceholder, SubSection } from "../ui/section";
import { ToolBadge, ToolBadgeList } from "../ui/tool-badge";

interface RecommendedMcpServer {
  id: string;
  name: string;
  description: string;
  githubUrl: string;
  command: string;
  args: string[];
}
interface McpConfigPath {
  name: string;
  description: string;
  path: string;
}

const recommendedMcpServers: RecommendedMcpServer[] = [
  {
    id: "context7",
    name: "Context7",
    description:
      "Context7 pulls up-to-date, version-specific documentation and code examples straight from the source — and places them directly into your prompt, ensuring accurate and current programming assistance.",
    githubUrl: "https://github.com/upstash/context7",
    command: "npx",
    args: ["@upstash/context7-mcp"],
  },
];

function useThirdPartyMcp() {
  const [isLoading, setIsLoading] = useState(true);
  const [availableConfigs, setAvailableConfigs] = useState<McpConfigPath[]>([]);
  const [importFromAllConfigs, setImportFromAllConfigs] =
    useState<() => Promise<void>>();
  const [importFromConfig, setImportFromConfig] =
    useState<(config: McpConfigPath) => Promise<void>>();
  const [openConfig, setOpenConfig] =
    useState<(config: McpConfigPath) => Promise<void>>();

  useEffect(() => {
    let isCancelled = false;
    const fetchConfigs = async () => {
      setIsLoading(true);
      try {
        const {
          availableConfigs,
          importFromAllConfigs: doImportAll,
          importFromConfig: doImportSingle,
          openConfig: doOpenConfig,
        } = await vscodeHost.fetchAvailableThirdPartyMcpConfigs();
        if (!isCancelled) {
          setAvailableConfigs(availableConfigs);
          setImportFromAllConfigs(() => doImportAll);
          setImportFromConfig(() => doImportSingle);
          setOpenConfig(() => doOpenConfig);
        }
      } catch (e) {
        console.error("Failed to fetch third party mcp configs", e);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };
    fetchConfigs();
    return () => {
      isCancelled = true;
    };
  }, []);

  return {
    isLoading,
    availableConfigs,
    importFromAllConfigs,
    importFromConfig,
    openConfig,
  };
}

const ImportMcp: React.FC<{
  availableConfigs: McpConfigPath[];
  onImportAll: () => Promise<void>;
  onImportSingle: (config: McpConfigPath) => Promise<void>;
  onOpenConfig: (config: McpConfigPath) => Promise<void>;
}> = ({ availableConfigs, onImportAll, onImportSingle, onOpenConfig }) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-medium text-sm">
          {t("settings.mcp.importServers")}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t("settings.mcp.foundSources", { count: availableConfigs.length })}
          </span>
          <Button
            onClick={() => onImportAll()}
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
          >
            <Download className="mr-1 size-3" />
            {t("settings.mcp.importAll")}
          </Button>
        </div>
        <McpConfigList
          configs={availableConfigs}
          onImportSingle={onImportSingle}
          onOpenConfig={onOpenConfig}
        />
      </div>
    </div>
  );
};

const McpConfigList: React.FC<{
  configs: McpConfigPath[];
  onImportSingle: (config: McpConfigPath) => Promise<void>;
  onOpenConfig: (config: McpConfigPath) => Promise<void>;
}> = ({ configs, onImportSingle, onOpenConfig }) => {
  const { t } = useTranslation();

  if (configs.length === 0) {
    return null;
  }

  return (
    <div className="flex max-h-[100px] flex-col gap-1 overflow-y-auto rounded border p-1">
      {configs.map((config, index) => {
        const fileName = getFileName(config.path);
        return (
          <div
            key={config.path + index}
            className="group flex items-center justify-between rounded px-1 py-0.5 hover:bg-secondary/50"
          >
            <div
              className="flex flex-1 cursor-pointer items-center truncate"
              onClick={() => onOpenConfig(config)}
              title={config.path}
            >
              <FileIcon
                path={config.path}
                className="mr-1 ml-0.5 shrink-0 text-xl/4"
                defaultIconClassName="ml-0 mr-0.5"
                isDirectory={false}
              />
              <span className="mr-1 truncate font-semibold text-foreground">
                {fileName}
              </span>
              <span className="truncate text-foreground/70 text-sm">
                {config.name}
              </span>
            </div>
            <Button
              onClick={() => onImportSingle(config)}
              size="sm"
              variant="outline"
              className="ml-2 h-6 shrink-0 px-2 text-xs opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            >
              <Download className="mr-1 size-3" />
              {t("settings.mcp.import")}
            </Button>
          </div>
        );
      })}
    </div>
  );
};

export const PochiTools: React.FC = () => {
  const { connections, isLoading } = useMcp();
  const pochiConnection = connections?.pochi;
  if (!pochiConnection) return;

  const tools = Object.entries(pochiConnection.tools).map(([id, tool]) => ({
    id,
    ...tool,
  }));

  return (
    <SubSection title="Pochi">
      {isLoading ? (
        <div className="flex w-full flex-wrap gap-2 py-2 ">
          <PochiToolsSkeleton />
        </div>
      ) : (
        <ToolBadgeList tools={tools} />
      )}
    </SubSection>
  );
};

function PochiToolsSkeleton() {
  return Array.from({ length: 4 }).map((_, i) => (
    <Skeleton
      key={i}
      className="h-6 bg-secondary"
      style={{
        width: `${Math.random() * 3 + 4}rem`,
      }}
    />
  ));
}

export const McpSection: React.FC = () => {
  const { t } = useTranslation();
  const { connections: mcpConnections, isLoading: isLoadingConnections } =
    useMcp();

  const connections = Object.fromEntries(
    Object.entries(mcpConnections).filter(
      ([_, connection]) => connection.kind === undefined,
    ),
  );

  const {
    isLoading: isLoadingThirdParty,
    availableConfigs,
    importFromAllConfigs,
    importFromConfig,
    openConfig,
  } = useThirdPartyMcp();

  const title = (
    <TooltipProvider>
      <div className="flex items-center">
        {t("settings.mcp.title")}
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={commandForMcp("openServerSettings")}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 rounded-md p-2 hover:bg-secondary/50 hover:text-secondary-foreground dark:hover:bg-secondary"
            >
              <PencilIcon className="size-3" />
            </a>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t("settings.mcp.tooltip")}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );

  const isLoading = isLoadingConnections || isLoadingThirdParty;
  const hasConnections = Object.keys(connections).length > 0;
  const hasAvailableConfigs =
    !isLoading && availableConfigs && availableConfigs.length > 0;

  return (
    <SubSection title={title}>
      <div className="w-full">
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex justify-between rounded-md border px-2 py-2">
              <Skeleton
                className="h-6 bg-secondary"
                style={{
                  width: "15rem",
                }}
              />
            </div>
          ) : hasConnections ? (
            Object.keys(connections).map((name) => (
              <Connection
                key={name}
                name={name}
                connection={connections[name]}
              />
            ))
          ) : hasAvailableConfigs ? (
            <>
              <EmptySectionPlaceholder
                content={t("settings.mcp.noServersYet")}
              />
              <ImportMcp
                availableConfigs={availableConfigs}
                onImportAll={importFromAllConfigs || (() => Promise.resolve())}
                onImportSingle={importFromConfig || (() => Promise.resolve())}
                onOpenConfig={openConfig || (() => Promise.resolve())}
              />
            </>
          ) : (
            <RecommandedMcpServers />
          )}
        </div>
      </div>
    </SubSection>
  );
};

const RecommandedMcpServers: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {recommendedMcpServers.length > 0 && (
        <div>
          <h4 className="mb-2 ml-1 font-medium text-muted-foreground text-sm">
            {t("settings.mcp.recommendedServers")}
          </h4>
          <div className="space-y-2">
            {recommendedMcpServers.map((server) => (
              <RecommendedMcpCard
                key={server.id}
                id={server.id}
                name={server.name}
                description={server.description}
                githubUrl={server.githubUrl}
                command={server.command}
                args={server.args}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const Connection: React.FC<{
  name: string;
  connection: McpServerConnection;
}> = ({ name, connection }) => {
  const { status, error, tools } = connection;
  const [isOpen, setIsOpen] = useState(false);

  const hasTools = tools && Object.keys(tools).length > 0;

  return (
    <div className="rounded-md border px-2">
      <div className="group relative flex h-10 w-full items-center justify-between">
        <div
          className="flex flex-1 cursor-pointer items-center overflow-x-hidden"
          onClick={() => setIsOpen(!isOpen)}
        >
          <Dot
            className={cn("size-6 shrink-0", {
              "text-muted-foreground": status === "stopped",
              "animate-pulse text-success": status === "starting",
              "text-success": status === "ready",
              "text-error": status === "error",
            })}
          />
          <span className="truncate font-semibold">{name}</span>
          <a
            href={commandForMcp("openServerSettings", name)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2"
          >
            <Edit
              className={cn(
                "size-4 cursor-pointer opacity-0 transition-opacity duration-200 group-hover:opacity-100",
              )}
            />
          </a>
          {status === "error" && (
            <a
              href={commandForMcp("restartServer", name)}
              className={cn(
                "ml-2 rounded-md p-1 hover:bg-muted",
                "!ring-0 outline-none !focus:ring-0 focus:outline-none",
              )}
              draggable="false"
            >
              <RotateCw className="size-4 text-muted-foreground" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={commandForMcp(
              status === "stopped" ? "startServer" : "stopServer",
              name,
            )}
            className="flex items-center outline-none ring-0 ring-offset-0 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            draggable="false"
          >
            <Switch
              checked={status !== "stopped"}
              disabled={status === "starting"}
            />
          </a>
          <ChevronsUpDown
            className={cn("size-5 cursor-pointer", isOpen && "rotate-180")}
            onClick={() => setIsOpen(!isOpen)}
          />
        </div>
      </div>
      <div
        className={cn(
          "origin-top overflow-hidden transition-all duration-100 ease-in-out",
          isOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        {status === "error" && (
          <>
            <hr className="border-muted" />
            <div className="flex w-full justify-center py-2 text-error">
              <p className="text-wrap">{error}</p>
            </div>
          </>
        )}
        {hasTools && (
          <>
            <hr className="border-muted" />
            <McpToolBadgeList
              serverName={name}
              serverStatus={status}
              tools={tools}
            />
          </>
        )}
      </div>
    </div>
  );
};

const McpToolBadgeList: React.FC<{
  serverName: string;
  serverStatus: "stopped" | "starting" | "ready" | "error";
  tools: McpServerConnection["tools"];
}> = ({ serverName, serverStatus, tools }) => {
  const { t } = useTranslation();
  const keys = Object.keys(tools);
  return (
    <TooltipProvider>
      <div className="flex w-full flex-wrap gap-2 py-2 ">
        {keys.length > 0 ? (
          keys.map((name) => (
            <ToolBadge
              key={name}
              id={name}
              disabled={tools[name].disabled}
              notAvailable={tools[name].disabled || serverStatus !== "ready"}
              href={
                serverStatus === "ready"
                  ? commandForMcp("toggleToolEnabled", serverName, name)
                  : undefined
              }
              description={tools[name].description}
            />
          ))
        ) : (
          <div className="flex w-full justify-center font-semibold">
            {t("settings.mcp.noToolsAvailable")}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

function commandForMcp(
  command:
    | "addServer"
    | "importServers"
    | "openServerSettings"
    | "startServer"
    | "stopServer"
    | "restartServer"
    | "toggleToolEnabled",
  serverName?: string,
  toolName?: string,
  recommendedServer?: {
    command: string;
    args: string[];
  },
): string {
  let cmd: string = command;
  let args: unknown[] = [];
  if (command === "startServer") {
    cmd = "serverControl";
    args = ["start", serverName];
  } else if (command === "stopServer") {
    cmd = "serverControl";
    args = ["stop", serverName];
  } else if (command === "restartServer") {
    cmd = "serverControl";
    args = ["restart", serverName];
  } else if (command === "toggleToolEnabled") {
    args = [serverName, toolName];
  } else if (command === "addServer" && recommendedServer) {
    args = [serverName, recommendedServer];
  } else if (command === "openServerSettings") {
    args = [serverName];
  }

  return `command:pochi.mcp.${cmd}?${encodeURIComponent(JSON.stringify(args))}`;
}

interface RecommendedMcpCardProps {
  id: string;
  name: string;
  description: string;
  githubUrl: string;
  command: string;
  args: string[];
}

function RecommendedMcpCard({
  id,
  name,
  description,
  githubUrl,
  command,
  args,
}: RecommendedMcpCardProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border bg-card/70 p-4 text-card-foreground shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">{name}</h3>
        <a
          href={commandForMcp("addServer", id, undefined, {
            command,
            args,
          })}
        >
          <Button size="sm">{t("settings.mcp.add")}</Button>
        </a>
      </div>
      <a
        href={githubUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-center text-muted-foreground text-sm hover:text-foreground"
      >
        <Github className="mr-1 h-4 w-4" />
        {t("settings.mcp.viewOnGitHub")}
      </a>
      <p className="mt-4 text-muted-foreground text-sm">{description}</p>
      <div className="mt-4 flex items-center justify-between">
        <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
          {command} {args.join(" ")}
        </code>
        <span className="text-muted-foreground text-xs">
          {t("settings.mcp.requires", { requirement: "npm" })}
        </span>
      </div>
    </div>
  );
}
