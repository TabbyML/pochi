import type { McpTool } from "@getpochi/tools";
import { type Signal, signal } from "@preact/signals-core";
import { getLogger } from "../base";
import type { McpServerConfig } from "../configuration/index.js";
import { updatePochiConfig } from "../configuration/index.js";

import { entries } from "remeda";
import { McpConnection, type McpConnectionStatus } from "./mcp-connection";
import { type McpToolExecutable, omitDisabled } from "./types";

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
  instructions: string;
}

export interface McpHubOptions {
  /** Reactive configuration signal */
  configSignal: Signal<Record<string, McpServerConfig>>; // Remove the ?
  clientName?: string;
}

export class McpHub implements Disposable {
  private connections: McpConnectionMap = new Map();
  private listeners: Disposable[] = [];
  private config: Record<string, McpServerConfig>;
  private configSignal?: Signal<Record<string, McpServerConfig>>;
  private readonly clientName: string;

  readonly status: Signal<McpHubStatus>;

  constructor(options: McpHubOptions) {
    this.configSignal = options.configSignal;
    this.config = options.configSignal.value || {};
    this.clientName = options.clientName ?? "pochi";
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

    const serverName = name
      ? this.generateUniqueName(name)
      : this.generateUniqueName("server");
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

    // Persist configuration changes to file
    updatePochiConfig({ mcp: newConfig }).catch((error) => {
      logger.error("Failed to persist MCP configuration changes", error);
    });

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

    // Initialize connections with current config
    for (const [name, config] of Object.entries(this.config)) {
      this.createConnection(name, config);
    }

    // Subscribe to config signal changes if provided
    if (this.configSignal) {
      this.listeners.push({
        dispose: this.configSignal.subscribe((newConfig) => {
          logger.debug(
            "MCP servers configuration changed via signal:",
            newConfig,
          );
          this.updateConfig(newConfig);
        }),
      });
    }
  }

  private notifyStatusChange() {
    const status = this.buildStatus();
    this.status.value = status;
    logger.trace("Status updated:", status);
  }

  private buildStatus(): McpHubStatus {
    const connections = Object.keys(this.config ?? {}).reduce<
      Record<string, McpConnectionStatus>
    >((acc, name) => {
      const connection = this.connections.get(name);
      if (connection) {
        acc[name] = connection.instance.status.value;
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
    const connection = new McpConnection(name, this.clientName, config);

    // Subscribe to status changes
    const statusListener = {
      dispose: connection.status.subscribe(() => {
        logger.debug(`Connection status updated for ${name}`);
        this.notifyStatusChange();
      }),
    };

    const connectionObject = {
      instance: connection,
      listeners: [statusListener] as Disposable[],
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
