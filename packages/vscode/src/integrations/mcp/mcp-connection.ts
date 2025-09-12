import type { McpServerConfig } from "@getpochi/common/configuration";
import {
  McpConnection as BaseConnection,
  type McpConnectionStatus,
  type McpToolExecutable,
} from "@getpochi/common/mcp-utils";
import type { McpToolStatus } from "@getpochi/common/vscode-webui-bridge";
import { type Signal, signal } from "@preact/signals-core";
import type * as vscode from "vscode";
import { isToolEnabledChanged } from "./utils";

/**
 * VSCode-specific wrapper for McpConnection that adds:
 * - vscode.Disposable interface
 * - @preact/signals-core Signal for reactive status updates
 * - VSCode extension context integration
 */
export class McpConnection implements vscode.Disposable {
  private baseConnection: BaseConnection;
  readonly status: Signal<
    McpConnectionStatus & {
      tools: Record<string, McpToolStatus & McpToolExecutable>;
    }
  >;

  constructor(
    readonly serverName: string,
    private readonly extensionContext: vscode.ExtensionContext,
    private config: McpServerConfig,
  ) {
    // Initialize status signal first with default values
    this.status = signal({
      status: "stopped" as const,
      error: undefined,
      tools: {},
    });

    // Create the base connection with status change callback
    this.baseConnection = new BaseConnection(
      serverName,
      this.extensionContext.extension.id, // Use extension ID as client name
      config,
      {
        onStatusChange: (status) => {
          // Transform the status to include VSCode-specific tool information
          this.status.value = {
            ...status,
            tools: this.transformTools(status.tools),
          };
        },
      },
    );

    // Update status signal with current status
    this.status.value = {
      ...this.baseConnection.getStatus(),
      tools: this.transformTools(this.baseConnection.getStatus().tools),
    };
  }

  updateConfig(config: McpServerConfig) {
    const oldConfig = this.config;
    this.config = config;

    // Update the base connection
    this.baseConnection.updateConfig(config);

    // Handle VSCode-specific tool enabled/disabled changes
    if (isToolEnabledChanged(oldConfig, config)) {
      // The base connection will handle the status update via callback
      // but we can add any VSCode-specific logic here if needed
    }
  }

  restart() {
    this.baseConnection.restart();
  }

  /**
   * Transform tools from base connection to include VSCode-specific McpToolStatus
   */
  private transformTools(
    tools: Record<
      string,
      McpToolExecutable & {
        disabled: boolean;
        description?: string;
        inputSchema: any;
      }
    >,
  ): Record<string, McpToolStatus & McpToolExecutable> {
    const result: Record<string, McpToolStatus & McpToolExecutable> = {};

    for (const [name, tool] of Object.entries(tools)) {
      result[name] = {
        disabled: tool.disabled,
        description: tool.description,
        inputSchema: tool.inputSchema,
        execute: tool.execute,
      };
    }

    return result;
  }

  dispose() {
    this.baseConnection.dispose();
  }
}
