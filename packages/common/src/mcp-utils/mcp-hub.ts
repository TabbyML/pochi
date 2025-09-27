import type { McpTool } from "@getpochi/tools";
import { type Signal, batch, computed, signal } from "@preact/signals-core";
import { entries, mapValues, mergeAll, omit, pickBy, values } from "remeda";
import { getLogger } from "../base";
import type { McpServerConfig } from "../configuration/index.js";
import {
  inspectPochiConfig,
  updatePochiConfig,
} from "../configuration/index.js";
import { McpConnection } from "./mcp-connection";
import type {
  McpServerConnection,
  McpServerConnectionExecutable,
  McpToolExecutable,
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

  readonly #status = computed(() => this.buildStatus());

  readonly status = computed(() => omit(this.#status.value, ["executeFns"]));

  readonly executeFns = computed(() => this.#status.value.executeFns);

  constructor(options: McpHubOptions) {
    this.config = options.config;
    this.vendorTools = options.vendorTools;
    this.clientName = options.clientName ?? "pochi";
    this.init();
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

  private buildStatus() {
    logger.debug("Build MCPHub Status");
    const connections: Record<string, McpServerConnectionExecutable> = {};
    for (const [vendorId, tools] of Object.entries(this.vendorTools.value)) {
      connections[vendorId] = {
        status: "ready",
        error: undefined,
        kind: "vendor",
        tools: mapValues(tools, (tool) => ({
          ...tool,
          disabled: false,
        })),
      };
    }

    for (const [name, connection] of Object.entries(this.connections.value)) {
      connections[name] = {
        ...connection.status,
        tools: mapValues(connection.status.tools, (tool) => ({
          ...tool,
        })),
      };
    }

    const toolset: Record<string, McpTool & McpToolExecutable> = mergeAll(
      values(
        pickBy(
          connections,
          (connection) => connection.status === "ready" && !!connection.tools,
        ),
      )
        .map((connection) => pickBy(connection.tools, (tool) => !tool.disabled))
        .map((tool) => mapValues(tool, (tool) => omit(tool, ["disabled"]))),
    );

    const instructions = entries(connections)
      .filter(([, instructions]) => !!instructions)
      .map(
        ([name, instructions]) =>
          `# Instructions from ${name} mcp server\n${instructions}`,
      )
      .join("\n\n");

    return {
      connections: mapValues(connections, (connection) => ({
        ...connection,
        tools: mapValues(connection.tools, (tool) => omit(tool, ["execute"])),
      })),
      toolset: mapValues(toolset, (tool) => omit(tool, ["execute"])),
      instructions,
      executeFns: mapValues(toolset, (tool) => tool.execute),
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
