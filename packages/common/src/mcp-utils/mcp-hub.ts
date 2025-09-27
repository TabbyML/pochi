import type { McpTool } from "@getpochi/tools";
import {
  type ReadonlySignal,
  type Signal,
  batch,
  computed,
  signal,
} from "@preact/signals-core";
import type { ToolCallOptions } from "ai";
import { entries, omit } from "remeda";
import { getLogger } from "../base";
import type { McpServerConfig } from "../configuration/index.js";
import {
  inspectPochiConfig,
  updatePochiConfig,
} from "../configuration/index.js";
import { McpConnection } from "./mcp-connection";
import type {
  McpServerConnection,
  McpToolExecutable,
  McpToolStatus,
} from "./types";

// Define a minimal Disposable interface to avoid vscode dependency
type Disposable = { dispose(): void };

const logger = getLogger("MCPHub");

export interface McpHubStatus {
  connections: Record<string, McpServerConnection>;
  toolset: Record<string, McpTool>;
  instructions: string;
}

export interface McpHubOptions {
  /** Reactive configuration signal */
  config: Signal<Record<string, McpServerConfig>>;
  vendorTools: Signal<
    Record<string, Record<string, McpTool & McpToolExecutable>>
  >;
  clientName?: string;
}

export class McpHub implements Disposable {
  private listeners: Disposable[] = [];

  private readonly connections: Signal<Record<string, McpConnection>> = signal(
    {},
  );
  private readonly config: Signal<Record<string, McpServerConfig>>;
  private readonly vendorTools: Signal<
    Record<string, Record<string, McpTool & McpToolExecutable>>
  >;
  private readonly clientName: string;

  readonly status: ReadonlySignal<McpHubStatus> = computed(() =>
    this.buildStatus(),
  );

  constructor(options: McpHubOptions) {
    this.config = options.config;
    this.vendorTools = options.vendorTools;
    this.clientName = options.clientName ?? "pochi";
    this.init();
  }

  executeTool(
    name: string,
    args: unknown,
    options: ToolCallOptions,
  ): Promise<unknown> {
    for (const [_, tools] of Object.entries(this.vendorTools.value)) {
      const execute = tools[name]?.execute;
      if (execute) {
        return execute(args, options);
      }
    }

    for (const [_, connection] of Object.entries(this.connections.value)) {
      const execute = connection.status.tools[name]?.execute;
      if (execute) {
        return execute(args, options);
      }
    }

    throw new Error(`Tool ${name} not found`);
  }

  restart(name: string) {
    const connection = this.connections.value[name];
    if (connection) {
      connection.restart();
    } else {
      logger.debug(`Tried to restart non-existing connection: ${name}`);
    }
  }

  start(name: string) {
    if (this.config.value[name]) {
      const newConfig = {
        ...this.config.value,
        [name]: { ...this.config.value[name], disabled: false },
      };
      this.saveConfig(newConfig);
    } else {
      logger.debug(`Tried to start non-existing server: ${name}`);
    }
  }

  stop(name: string) {
    if (this.config.value[name]) {
      const newConfig = {
        ...this.config.value,
        [name]: { ...this.config.value[name], disabled: true },
      };
      this.saveConfig(newConfig);
    } else {
      logger.debug(`Tried to stop non-existing server: ${name}`);
    }
  }

  async addServer(
    name?: string,
    serverConfig?: McpServerConfig,
  ): Promise<string> {
    if (!serverConfig) {
      throw new Error("Server configuration is required");
    }

    const serverName = name
      ? this.generateUniqueName(name)
      : this.generateUniqueName("server");
    const newConfig = {
      ...this.config.value,
      [serverName]: serverConfig,
    };

    await this.saveConfig(newConfig);
    return serverName;
  }

  addServers(
    serverConfigs: Array<McpServerConfig & { name: string }>,
  ): string[] {
    const newConfig = { ...this.config.value };
    const addedNames: string[] = [];

    for (const { name, ...config } of serverConfigs) {
      const serverName = this.generateUniqueName(name, newConfig);
      newConfig[serverName] = config;
      addedNames.push(serverName);
    }

    this.saveConfig(newConfig);
    return addedNames;
  }

  private async saveConfig(newConfig: Record<string, McpServerConfig>) {
    for (const [name, config] of entries(newConfig)) {
      const { effectiveTargets } = inspectPochiConfig(`mcp.${name}`);
      const editTarget = effectiveTargets[0] || "user";
      // Persist configuration changes to file
      await updatePochiConfig({ mcp: { [name]: config } }, editTarget).catch(
        (error) => {
          logger.error("Failed to persist MCP configuration changes", error);
        },
      );
    }
  }

  private async onConfigChanged() {
    const newConfig = this.config.value;
    // Update existing connections
    for (const [name, config] of Object.entries(newConfig)) {
      if (this.connections.value[name]) {
        this.updateConnection(name, config);
      } else {
        this.createConnection(name, config);
      }
    }

    // Remove connections that are no longer in the config
    for (const name of Object.keys(this.connections.value)) {
      if (!(name in newConfig)) {
        this.removeConnection(name);
      }
    }
  }

  getCurrentConfig(): Record<string, McpServerConfig> {
    return { ...this.config.value };
  }

  toggleToolEnabled(serverName: string, toolName: string) {
    const serverConfig = this.config.value[serverName];
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
      ...this.config.value,
      [serverName]: {
        ...serverConfig,
        disabledTools: newDisabledTools,
      },
    };

    this.saveConfig(newConfig);
  }

  private generateUniqueName(
    baseName: string,
    currentServers?: Record<string, McpServerConfig>,
  ): string {
    const servers = currentServers ?? this.config.value;
    let serverName = baseName;
    let counter = 1;

    while (servers && serverName in servers) {
      serverName = `${baseName}-${counter}`;
      counter++;
    }

    return serverName;
  }

  private init() {
    logger.trace("Initializing MCP Hub with config:", this.config.value);

    // Initialize connections with current config
    batch(() => {
      for (const [name, config] of Object.entries(this.config.value)) {
        this.createConnection(name, config);
      }
    });

    // Subscribe to config signal changes if provided
    this.listeners.push({
      dispose: this.config.subscribe(() => {
        logger.debug("MCP servers configuration changed via signal:");
        this.onConfigChanged();
      }),
    });
  }

  private buildStatus(): McpHubStatus {
    logger.debug("Build MCPHub Status");
    const connections: McpHubStatus["connections"] = {};
    for (const [vendorId, tools] of Object.entries(this.vendorTools.value)) {
      if (!connections[vendorId]) {
        connections[vendorId] = {
          status: "ready",
          error: undefined,
          kind: "vendor",
          tools: Object.entries(tools).reduce<Record<string, McpToolStatus>>(
            (acc, [toolName, tool]) => {
              acc[toolName] = {
                ...omit(tool, ["execute"]),
                disabled: false,
              };
              return acc;
            },
            {},
          ),
        };
      }
    }

    for (const [name, connection] of Object.entries(this.connections.value)) {
      connections[name] = {
        ...connection.status,
        tools: Object.entries(connection.status.tools).reduce<
          Record<string, McpToolStatus>
        >((acc, [toolName, tool]) => {
          acc[toolName] = omit(tool, ["execute"]);
          return acc;
        }, {}),
      };
    }

    const toolset = Object.entries(connections).reduce<Record<string, McpTool>>(
      (acc, [, connectionStatus]) => {
        if (connectionStatus.status === "ready" && connectionStatus.tools) {
          const tools = Object.entries(connectionStatus.tools).reduce<
            Record<string, McpTool>
          >((toolAcc, [toolName, tool]) => {
            if (!tool.disabled) {
              toolAcc[toolName] = omit(tool, ["disabled"]);
            }
            return toolAcc;
          }, {});
          Object.assign(acc, tools);
        }
        return acc;
      },
      {},
    );

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

  private onConnectionStatusChanged = () => {
    logger.debug("Connection status changed.");
    this.connections.value = {
      ...this.connections.value,
    };
  };

  private createConnection(name: string, config: McpServerConfig) {
    const connection = new McpConnection(
      name,
      this.clientName,
      config,
      this.onConnectionStatusChanged,
    );

    this.connections.value = {
      ...this.connections.value,
      [name]: connection,
    };
    logger.debug(`Connection ${name} created.`);
  }

  private updateConnection(name: string, config: McpServerConfig) {
    const connection = this.connections.value[name];
    if (connection) {
      logger.debug(`Updating ${name} with new config.`);
      connection.updateConfig(config);
    }
  }

  private removeConnection(name: string) {
    const connection = this.connections.value[name];
    if (connection) {
      connection.dispose();
      this.connections.value = omit(this.connections.value, [name]);
      logger.debug(`Connection ${name} removed.`);
    }
  }

  dispose() {
    for (const listener of this.listeners) {
      listener.dispose();
    }
    this.listeners = [];

    for (const [_, connection] of Object.entries(this.connections.value)) {
      connection.dispose();
    }

    this.connections.value = {};
  }
}
