import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type Signal, signal } from "@preact/signals-core";
import { createMachine, interpret } from "@xstate/fsm";
import { type ToolSet, experimental_createMCPClient as createClient } from "ai";
import type { JSONSchema7 } from "json-schema";
import { getLogger } from "../base";
import type { McpServerConfig } from "../configuration/index.js";

import {
  type McpToolExecutable,
  isHttpTransport,
  isStdioTransport,
} from "./types";
import {
  checkUrlIsSseServer,
  isToolEnabledChanged,
  readableError,
  shouldRestartDueToConfigChanged,
} from "./utils";

// Define a minimal Disposable interface to avoid vscode dependency
type Disposable = { dispose(): void };

type McpClient = Awaited<ReturnType<typeof createClient>>;

// Status interface for callback notifications
export interface McpConnectionStatus {
  status: "stopped" | "starting" | "ready" | "error";
  error: string | undefined;
  tools: Record<string, McpToolStatus & McpToolExecutable>;
}

export interface McpToolStatus {
  disabled: boolean;
  description?: string;
  inputSchema: {
    jsonSchema: JSONSchema7;
  };
}

interface McpClientWithInstructions extends McpClient {
  instructions?: string;
}

type FsmContext = {
  startingAbortController?: AbortController;
  client?: McpClient;
  toolset?: ToolSet;
  instructions?: string;
  error?: string;
  autoReconnectTimer?: ReturnType<typeof setTimeout>;
  autoReconnectAttempts: number;
};

type StartEvent = {
  type: "start";
};

type RestartEvent = {
  type: "restart";
};

type StopEvent = {
  type: "stop";
};

type ConnectedEvent = {
  type: "connected";
  client: McpClient;
  toolset: ToolSet;
  instructions?: string;
};

type ErrorEvent = {
  type: "error";
  error: string;
};

type FsmEvent =
  | StartEvent
  | RestartEvent
  | StopEvent
  | ConnectedEvent
  | ErrorEvent;

type FsmState = {
  value: "stopped" | "starting" | "ready" | "error";
  context: FsmContext;
};

const AbortedError = "AbortedError" as const;
const AutoReconnectDelay = 20_000; // 20 seconds
const AutoReconnectMaxAttempts = 20;

export interface McpConnectionOptions {
  onStatusChange?: (status: McpConnectionStatus) => void;
}

export class McpConnection implements Disposable {
  readonly logger: ReturnType<typeof getLogger>;
  private onStatusChange?: (status: McpConnectionStatus) => void;
  readonly status: Signal<McpConnectionStatus>;

  private fsmDef = createMachine<FsmContext, FsmEvent, FsmState>({
    initial: "stopped",
    context: {
      autoReconnectAttempts: 0,
    },
    states: {
      stopped: {
        on: {
          start: "starting",
          restart: "starting",
        },
      },
      starting: {
        entry: (context) => {
          context.startingAbortController = new AbortController();
          this.connect({ signal: context.startingAbortController.signal });
        },
        exit: (context) => {
          if (context.startingAbortController) {
            context.startingAbortController.abort();
          }
        },
        on: {
          connected: "ready",
          restart: "starting",
          stop: "stopped",
          error: "error",
        },
      },
      ready: {
        entry: (context, event) => {
          if (event.type !== "connected") {
            this.logger.debug(
              `Expected 'connected' event entry 'ready' state, got: ${event.type}`,
            );
            return;
          }

          context.client = event.client;
          context.toolset = event.toolset;
          context.instructions = event.instructions;
        },
        exit: (context) => {
          if (context.client) {
            this.shutdown(context.client);
            context.client = undefined;
            context.toolset = undefined;
            context.instructions = undefined;
          }
        },
        on: {
          restart: "starting",
          stop: "stopped",
          error: "error",
        },
      },
      error: {
        entry: (context, event) => {
          if (event.type !== "error") {
            this.logger.debug(
              `Expected 'error' event entry 'error' state, got: ${event.type}`,
            );
            return;
          }
          context.error = event.error;
          if (context.autoReconnectAttempts < AutoReconnectMaxAttempts) {
            this.logger.debug(`Auto reconnect in ${AutoReconnectDelay}ms`);
            context.autoReconnectTimer = setTimeout(() => {
              this.fsm.send({ type: "restart" });
            }, AutoReconnectDelay);
            context.autoReconnectAttempts += 1;
          }
        },
        exit: (context) => {
          context.error = undefined;
          if (context.autoReconnectTimer) {
            clearTimeout(context.autoReconnectTimer);
            context.autoReconnectTimer = undefined;
          }
        },
        on: {
          start: "starting",
          restart: "starting",
          stop: "stopped",
        },
      },
    },
  });

  private fsm = interpret(this.fsmDef);
  private listeners: Disposable[] = [];

  constructor(
    readonly serverName: string,
    private readonly clientName: string,
    private config: McpServerConfig,
    options: McpConnectionOptions = {},
  ) {
    this.logger = getLogger(`MCPConnection(${this.serverName})`);
    this.onStatusChange = options.onStatusChange;

    // Initialize status signal with default values
    this.status = signal({
      status: "stopped" as const,
      error: undefined,
      tools: {},
    });

    this.fsm.start();
    const { unsubscribe: dispose } = this.fsm.subscribe((state) => {
      this.logger.debug(`State changed: ${state.value}`);
      this.notifyStatusChange();
    });
    this.listeners.push({ dispose });

    if (!config.disabled) {
      this.logger.debug("Starting MCP connection...");
      this.fsm.send({ type: "start" });
    }
  }

  updateConfig(config: McpServerConfig) {
    const oldConfig = this.config;
    this.config = config;

    if (config.disabled && !oldConfig.disabled) {
      this.logger.debug("MCP server is disabled, stopping...");
      this.fsm.send({ type: "stop" });
      return;
    }

    if (oldConfig.disabled && !config.disabled) {
      this.logger.debug("MCP server is enabled, starting...");
      this.fsm.send({ type: "start" });
      return;
    }

    if (
      shouldRestartDueToConfigChanged(oldConfig, config) &&
      !config.disabled
    ) {
      this.logger.debug("Configuration changed, restarting...");
      this.fsm.send({ type: "restart" });
      return;
    }

    if (isToolEnabledChanged(oldConfig, config)) {
      this.logger.debug("Tool enabled/disabled changed, updating status...");
      this.notifyStatusChange();
    }
  }

  restart() {
    this.logger.debug("Restarting...");
    this.fsm.send({ type: "restart" });
  }

  getStatus(): McpConnectionStatus {
    return this.buildStatus();
  }

  private notifyStatusChange() {
    const status = this.buildStatus();
    this.status.value = status;
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  private buildStatus() {
    const { value, context } = this.fsm.state;
    const toolset = context.toolset ?? {}; // FIXME: fallback to cache toolset info in file
    return {
      status: value,
      error: context.error,
      instructions: context.instructions,
      tools: Object.entries(toolset).reduce<
        Record<string, McpToolStatus & McpToolExecutable>
      >((acc, [name, tool]) => {
        if (
          tool.inputSchema &&
          "jsonSchema" in tool.inputSchema &&
          tool.execute
        ) {
          acc[name] = {
            disabled: this.isToolDisabled(name),
            description: tool.description,
            inputSchema: {
              jsonSchema: tool.inputSchema.jsonSchema,
            },
            execute: async (args, options) => {
              try {
                if (this.isToolDisabled(name)) {
                  throw new Error(`Tool ${name} is disabled.`);
                }
                if (!tool.execute) {
                  throw new Error(`No execute function for tool ${name}.`);
                }
                return await tool.execute(args, options);
              } catch (error) {
                this.logger.debug(`Error while executing tool ${name}`, error);
                this.handleError(error);
                throw error;
              }
            },
          };
        }
        return acc;
      }, {}),
    };
  }

  private async connect({ signal }: { signal?: AbortSignal }) {
    let client: McpClient | undefined = undefined;
    try {
      const onUncaughtError = (error: unknown) => {
        this.logger.debug("Uncaught error.", error);
        this.handleError(error);
      };
      if (isStdioTransport(this.config)) {
        this.logger.debug("Connecting using Stdio transport.");
        client = await createClient({
          transport: new StdioClientTransport({
            command: this.config.command,
            args: this.config.args,
            cwd: this.config.cwd,
            env: {
              ...getDefaultEnvironment(),
              ...this.config.env,
            },
          }),
          name: this.clientName,
          onUncaughtError,
        });
      } else if (isHttpTransport(this.config)) {
        const isSse = await checkUrlIsSseServer(this.config.url);
        if (signal?.aborted) {
          throw AbortedError;
        }

        if (isSse) {
          this.logger.debug("Connecting using SSE transport.");
          client = await createClient({
            transport: {
              type: "sse",
              url: this.config.url,
              headers: this.config.headers,
            },
            name: this.clientName,
            onUncaughtError,
          });
        } else {
          this.logger.debug("Connecting using Streamable HTTP transport.");
          client = await createClient({
            transport: new StreamableHTTPClientTransport(
              new URL(this.config.url),
              {
                requestInit: {
                  headers: this.config.headers,
                },
              },
            ),
            name: this.clientName,
            onUncaughtError,
          });
        }
      } else {
        throw new Error(`Unsupported MCP configuration ${this.serverName}`);
      }
      if (signal?.aborted) {
        throw AbortedError;
      }

      const toolset = await client.tools();
      if (signal?.aborted) {
        throw AbortedError;
      }

      const instructions = (client as McpClientWithInstructions).instructions;
      if (signal?.aborted) {
        throw AbortedError;
      }

      this.fsm.send({
        type: "connected",
        client,
        toolset,
        instructions,
      });
    } catch (error) {
      try {
        await client?.close();
      } catch (error) {
        // Ignore error
      }

      if (error === AbortedError) {
        return;
      }

      const message = readableError(error);
      this.logger.debug("Error while connecting.", error);
      this.fsm.send({ type: "error", error: message });
    }
  }

  private async shutdown(client: McpClient) {
    try {
      await client.close();
    } catch (error) {
      this.logger.debug("Error while shutting down.", error);
    }
  }

  private isToolDisabled(toolName: string): boolean {
    return this.config.disabledTools?.includes(toolName) ?? false;
  }

  private handleError(error: unknown) {
    const message = readableError(error);
    if (message.toLocaleLowerCase().includes("connection closed")) {
      this.fsm.send({ type: "error", error: message });
    }
  }

  dispose() {
    this.fsm.send({ type: "stop" });
    for (const listener of this.listeners) {
      listener.dispose();
    }

    this.fsm.stop();
  }
}
