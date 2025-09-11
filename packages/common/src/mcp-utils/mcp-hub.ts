import type { McpTool } from "@getpochi/tools";
import { getLogger } from "../base";
import type { McpServerConfig } from "../configuration/index.js";

import { McpConnection, type McpConnectionStatus } from "./mcp-connection";
import type { McpToolExecutable } from "./types";

// Define a minimal Disposable interface to avoid vscode dependency
type Disposable = { dispose(): void };

const logger = getLogger("MCPHub");

type McpConnectionMap = Map<
  string,
  {
    instance: McpConnection;
    listeners: Disposable[];
  }
>;

export interface McpHubStatus {
  connections: Record<string, McpConnectionStatus>;
  toolset: Record<string, McpTool & McpToolExecutable>;
}

export interface McpHubOptions {
  config: Record<string, McpServerConfig>;
  logger?: ReturnType<typeof getLogger>;
  onStatusChange?: (status: McpHubStatus) => void;
  clientName?: string;
}

export class McpHub implements Disposable {
  private connections: McpConnectionMap = new Map();
  private listeners: Disposable[] = [];
  private config: Record<string, McpServerConfig>;
  private onStatusChange?: (status: McpHubStatus) => void;
  private readonly clientName: string;

  constructor(options: McpHubOptions) {
    this.config = options.config;
    this.onStatusChange = options.onStatusChange;
    this.clientName = options.clientName ?? "pochi";
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
    if (this.config[name]) {
      const newConfig = {
        ...this.config,
        [name]: { ...this.config[name], disabled: false },
      };
      this.updateConfig(newConfig);
    } else {
      logger.debug(`Tried to start non-existing server: ${name}`);
    }
  }

  stop(name: string) {
    if (this.config[name]) {
      const newConfig = {
        ...this.config,
        [name]: { ...this.config[name], disabled: true },
      };
      this.updateConfig(newConfig);
    } else {
      logger.debug(`Tried to stop non-existing server: ${name}`);
    }
  }

  addServer(name?: string, serverConfig?: McpServerConfig): string {
    if (!serverConfig) {
      throw new Error("Server configuration is required");
    }

    const serverName = name ? this.generateUniqueName(name) : this.generateUniqueName("server");
    const newConfig = {
      ...this.config,
      [serverName]: serverConfig,
    };

    this.updateConfig(newConfig);
    return serverName;
  }

  addServers(
    serverConfigs: Array<McpServerConfig & { name: string }>,
  ): string[] {
    const newConfig = { ...this.config };
    const addedNames: string[] = [];

    for (const { name, ...config } of serverConfigs) {
      const serverName = this.generateUniqueName(name, newConfig);
      newConfig[serverName] = config;
      addedNames.push(serverName);
    }

    this.updateConfig(newConfig);
    return addedNames;
  }

  updateConfig(newConfig: Record<string, McpServerConfig>) {
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
    for (const name of Array.from(this.connections.keys())) {
      if (!(name in newConfig)) {
        this.removeConnection(name);
      }
    }

    this.notifyStatusChange();
  }

  getCurrentConfig(): Record<string, McpServerConfig> {
    return { ...this.config };
  }

  toggleToolEnabled(serverName: string, toolName: string) {
    const serverConfig = this.config[serverName];
    if (!serverConfig) {
      logger.debug(`Server ${serverName} not found`);
      return;
    }

    const disabledTools = serverConfig.disabledTools ?? [];
    const isCurrentlyDisabled = disabledTools.includes(toolName);

    const newDisabledTools = isCurrentlyDisabled
      ? disabledTools.filter((tool) => tool !== toolName)
      : [...disabledTools, toolName];

    const newConfig = {
      ...this.config,
      [serverName]: {
        ...serverConfig,
        disabledTools: newDisabledTools,
      },
    };

    this.updateConfig(newConfig);
  }

  getStatus(): McpHubStatus {
    return this.buildStatus();
  }

  private generateUniqueName(
    baseName: string,
    currentServers?: Record<string, McpServerConfig>,
  ): string {
    const servers = currentServers ?? this.config;
    let serverName = baseName;
    let counter = 1;

    while (servers && serverName in servers) {
      serverName = `${baseName}-${counter}`;
      counter++;
    }

    return serverName;
  }

  private init() {
    logger.trace("Initializing MCP Hub with config:", this.config);
    for (const [name, config] of Object.entries(this.config)) {
      this.createConnection(name, config);
    }
  }

  private notifyStatusChange() {
    if (this.onStatusChange) {
      this.onStatusChange(this.buildStatus());
    }
    logger.trace("Status updated:", this.buildStatus());
  }

  private buildStatus(): McpHubStatus {
    const connections = Object.keys(this.config ?? {}).reduce<
      Record<string, McpConnectionStatus>
    >((acc, name) => {
      const connection = this.connections.get(name);
      if (connection) {
        acc[name] = connection.instance.getStatus();
      }
      return acc;
    }, {});

    const toolset = Object.entries(connections).reduce<
      Record<string, McpTool & McpToolExecutable>
    >((acc, [, connection]) => {
      if (connection.status === "ready" && connection.tools) {
        const tools = Object.entries(connection.tools).reduce<
          Record<string, McpTool & McpToolExecutable>
        >((toolAcc, [toolName, tool]) => {
          if (!tool.disabled) {
            const { disabled, ...rest } = tool;
            toolAcc[toolName] = rest;
          }
          return toolAcc;
        }, {});
        Object.assign(acc, tools);
      }
      return acc;
    }, {});

    return {
      connections,
      toolset,
    };
  }

  private createConnection(name: string, config: McpServerConfig) {
    const connection = new McpConnection(name, this.clientName, config, {
      onStatusChange: () => {
        logger.debug(`Connection status updated for ${name}`);
        this.notifyStatusChange();
      },
    });
    const connectionObject = {
      instance: connection,
      listeners: [] as Disposable[],
    };
    this.connections.set(name, connectionObject);
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

    for (const connection of Array.from(this.connections.values())) {
      for (const listener of connection.listeners) {
        listener.dispose();
      }
      connection.instance.dispose();
    }
    this.connections.clear();
    this.notifyStatusChange();
  }
}
