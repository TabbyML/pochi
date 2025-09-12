import { getLogger } from "@/lib/logger";
import type { McpServerConfig } from "@getpochi/common/configuration";
import type { McpToolExecutable } from "@getpochi/common/mcp-utils";
import type { McpTool } from "@getpochi/tools";
import type { McpToolStatus } from "@getpochi/common/vscode-webui-bridge";
import { type Signal, signal } from "@preact/signals-core";
import { inject, injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "../configuration";
import { McpConnection } from "./mcp-connection";
import { omitDisabled } from "./types";
import { entries } from "remeda";

const logger = getLogger("MCPHub");

type McpConnectionMap = Map<
  string,
  {
    instance: McpConnection;
    listeners: vscode.Disposable[];
  }
>;

@injectable()
@singleton()
export class McpHub implements vscode.Disposable {
  private connections: McpConnectionMap = new Map();
  private listeners: vscode.Disposable[] = [];
  private config: Record<string, McpServerConfig> | undefined = undefined;

  readonly status: Signal<ReturnType<typeof this.buildStatus>>;

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
    private readonly configuration: PochiConfiguration,
  ) {
    this.status = signal(this.buildStatus());
    this.init();
  }

  restart(name: string) {
    const connection = this.connections.get(name);
    if (connection) {
      connection.instance.restart();
    } else {
      logger.debug(`Tried to restart non-existing connection: ${name}`);
    }
  }

  start(name: string) {
    if (this.config?.[name]) {
      this.updateServerConfig(name, { ...this.config[name], disabled: false });
    } else {
      logger.debug(`Tried to start non-existing server: ${name}`);
    }
  }

  stop(name: string) {
    if (this.config?.[name]) {
      this.updateServerConfig(name, { ...this.config[name], disabled: true });
    } else {
      logger.debug(`Tried to stop non-existing server: ${name}`);
    }
  }

  addServer(name?: string, serverConfig?: McpServerConfig): string {
    const uniqueName = this.generateUniqueName(
      name || "replace-your-mcp-name-here",
      this.config,
    );

    this.updateServerConfig(
      uniqueName,
      serverConfig || {
        command: "npx",
        args: ["@your-package/mcp-server"],
      },
    );

    logger.debug(`Added MCP server: ${uniqueName}`);
    return uniqueName;
  }

  addServers(
    serverConfigs: Array<McpServerConfig & { name: string }>,
  ): string[] {
    if (serverConfigs.length === 0) {
      return [];
    }

    if (!this.config) {
      logger.error("Cannot add servers: configuration not initialized");
      return [];
    }

    const addedNames: string[] = [];
    const updatedConfig = { ...this.config };

    for (const serverConfig of serverConfigs) {
      const uniqueName = this.generateUniqueName(
        serverConfig.name,
        updatedConfig,
      );
      const { name: _, ...config } = serverConfig;
      updatedConfig[uniqueName] = config;
      addedNames.push(uniqueName);
    }

    this.configuration.updateMcpServers(updatedConfig);
    logger.debug(`Batch added ${addedNames.length} MCP servers`);

    return addedNames;
  }

  getCurrentConfig(): Record<string, McpServerConfig> {
    return this.config || {};
  }
  toggleToolEnabled(serverName: string, toolName: string) {
    if (!this.config?.[serverName]) {
      logger.debug(
        `Tried to toggle tool for non-existing server: ${serverName}`,
      );
      return;
    }
    // Create a deep copy of the server config to avoid mutating the original
    const serverConfig = { ...this.config[serverName] };
    if (!serverConfig.disabledTools) {
      serverConfig.disabledTools = [];
    } else {
      // Also copy the disabledTools array
      serverConfig.disabledTools = [...serverConfig.disabledTools];
    }

    const index = serverConfig.disabledTools.indexOf(toolName);
    const isCurrentlyDisabled = index > -1;
    if (isCurrentlyDisabled) {
      serverConfig.disabledTools.splice(index, 1);
    } else {
      serverConfig.disabledTools.push(toolName);
    }
    this.updateServerConfig(serverName, serverConfig);
  }

  private generateUniqueName(
    baseName: string,
    currentServers?: Record<string, McpServerConfig>,
  ): string {
    let serverName = baseName;
    let counter = 1;

    while (currentServers && serverName in currentServers) {
      serverName = `${baseName}-${counter}`;
      counter++;
    }

    return serverName;
  }

  private updateServerConfig(name: string, newConfig: McpServerConfig) {
    this.configuration.updateMcpServers({
      [name]: newConfig,
    });
    logger.debug(`Updated configuration for server ${name}:`, newConfig);
  }

  private init() {
    const mcpServersConfig = this.configuration.mcpServers.value;
    this.config = mcpServersConfig;
    logger.trace("Initializing MCP Hub with config:", mcpServersConfig);
    for (const [name, config] of Object.entries(mcpServersConfig)) {
      this.createConnection(name, config);
    }

    this.listeners.push({
      dispose: this.configuration.mcpServers.subscribe((newConfig) => {
        logger.debug("MCP servers configuration changed:", newConfig);

        // Check if the configuration actually changed to avoid redundant processing
        if (
          this.config &&
          JSON.stringify(this.config) === JSON.stringify(newConfig)
        ) {
          logger.trace("Configuration unchanged, skipping processing");
          return;
        }

        this.config = newConfig;

        // Update existing connections
        for (const [name, config] of Object.entries(newConfig)) {
          if (this.connections.has(name)) {
            this.updateConnection(name, config);
          } else {
            this.createConnection(name, config);
          }
        }

        // Remove connections that are no longer in the config
        for (const name of this.connections.keys()) {
          if (!(name in newConfig)) {
            this.removeConnection(name);
          }
        }

        this.updateStatus();
      }),
    });
  }

  private updateStatus() {
    this.status.value = this.buildStatus();
    logger.trace("Status updated:", this.status.value);
  }

  private buildStatus() {
    const connections = Object.keys(this.config ?? {}).reduce<
      Record<string, { status: "stopped" | "starting" | "ready" | "error"; error: string | undefined; tools: Record<string, McpToolStatus> }>
    >((acc, name) => {
      const connection = this.connections.get(name);
      if (connection) {
        const connectionStatus = connection.instance.status.value;
        acc[name] = {
          status: connectionStatus.status,
          error: connectionStatus.error || undefined,
          tools: connectionStatus.tools || {}
        };
      }
      return acc;
    }, {});

    const toolset = Object.entries(connections).reduce<
      Record<string, McpTool & McpToolExecutable>
    >((acc, [, connectionStatus]) => {
      if (connectionStatus.status === "ready" && connectionStatus.tools) {
        const tools = Object.entries(connectionStatus.tools).reduce<
          Record<string, McpTool & McpToolExecutable>
        >((toolAcc, [toolName, tool]) => {
          if (!tool.disabled) {
            toolAcc[toolName] = {
              ...omitDisabled(tool),
            };
          }
          return toolAcc;
        }, {});
        Object.assign(acc, tools);
      }
      return acc;
    }, {});

    const instructions = entries(connections)
      .filter(([, instructions]) => !!instructions)
      .map(
        ([name, instructions]) =>
          `# Instructions from ${name} mcp server\n${instructions}`,
      )
      .join("\n\n");

    return {
      connections,
      toolset,
      instructions,
    };
  }

  private createConnection(name: string, config: McpServerConfig) {
    const connection = new McpConnection(name, this.context, config);
    const connectionObject = {
      instance: connection,
      listeners: [] as vscode.Disposable[],
    };
    this.connections.set(name, connectionObject);
    connectionObject.listeners.push({
      dispose: connection.status.subscribe(() => {
        logger.debug(`Connection status updated for ${name}`);
        this.updateStatus();
      }),
    });
    logger.debug(`Connection ${name} created.`);
  }

  private updateConnection(name: string, config: McpServerConfig) {
    const connection = this.connections.get(name);
    if (connection) {
      logger.debug(`Updating ${name} with new config.`);
      connection.instance.updateConfig(config);
    }
  }

  private removeConnection(name: string) {
    const connection = this.connections.get(name);
    if (connection) {
      for (const listener of connection.listeners) {
        listener.dispose();
      }
      connection.instance.dispose();
      this.connections.delete(name);
      logger.debug(`Connection ${name} removed.`);
    }
  }

  dispose() {
    for (const listener of this.listeners) {
      listener.dispose();
    }
    this.listeners = [];

    for (const connection of this.connections.values()) {
      for (const listener of connection.listeners) {
        listener.dispose();
      }
      connection.instance.dispose();
    }
    this.connections.clear();
    this.updateStatus();
  }
}
