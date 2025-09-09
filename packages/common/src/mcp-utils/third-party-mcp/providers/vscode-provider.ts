import type { McpServerConfig } from "../../../configuration/index.js";
import * as vscode from "vscode";
import { BaseFileMcpProvider } from "./base-file-provider";

export class VscodeMcpProvider extends BaseFileMcpProvider {
  readonly name = "VSCode";
  readonly description = "VSCode MCP configuration";
  protected readonly pathSegments = {
    darwin: ["~", "Library", "Application Support", "Code", "User", "mcp.json"],
    linux: ["~", ".config", "Code", "User", "mcp.json"],
    win32: ["%APPDATA%", "Code", "User", "mcp.json"],
  };

  protected readonly configFieldName = "servers";

  async getServers(): Promise<Record<string, McpServerConfig>> {
    // Try to get servers from mcp.json first
    const servers = await super.getServers();
    if (Object.keys(servers).length > 0) {
      return servers;
    }
    return this.getServersFromSettings();
  }

  /**
   * This method is used to get the servers from the VSCode settings.
   * Used for mcp config in VSCode v1.101
   * @returns The servers from the VSCode settings
   */
  private async getServersFromSettings(): Promise<
    Record<string, McpServerConfig>
  > {
    try {
      const workspaceConfig = vscode.workspace.getConfiguration();
      const mcpSection = workspaceConfig.get<{
        servers?: Record<string, McpServerConfig>;
      }>("mcp");
      return mcpSection?.servers || {};
    } catch {
      return {};
    }
  }

  async openConfig(): Promise<void> {
    try {
      await vscode.commands.executeCommand("mcp.openUserConfiguration");
    } catch {
      await super.openConfig();
    }
  }
}
