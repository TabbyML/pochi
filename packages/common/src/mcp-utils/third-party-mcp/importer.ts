import { getLogger } from "@/lib/logger";
import type { McpServerConfig } from "@getpochi/common/configuration";
import { injectable, singleton } from "tsyringe";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { McpHub } from "../mcp-hub";
import type { McpConfigProvider } from "./provider";
import { ClaudeDesktopMcpProvider } from "./providers/claude-desktop-provider";
import { ClineMcpProvider } from "./providers/cline-provider";
import { CursorMcpProvider } from "./providers/cursor-provider";
import { RooCodeMcpProvider } from "./providers/roo-code-provider";
import { VscodeMcpProvider } from "./providers/vscode-provider";

const logger = getLogger("ThirdMcpImporter");

@injectable()
@singleton()
export class ThirdMcpImporter {
  private providers: McpConfigProvider[] = [
    new VscodeMcpProvider(),
    new ClineMcpProvider(),
    new ClaudeDesktopMcpProvider(),
    new CursorMcpProvider(),
    new RooCodeMcpProvider(),
  ];

  constructor(private readonly mcpHub: McpHub) {}

  async getAvailableProviders(): Promise<McpConfigProvider[]> {
    const availableProviders: McpConfigProvider[] = [];
    for (const provider of this.providers) {
      try {
        const servers = await provider.getServers();
        if (Object.keys(servers).length > 0) {
          availableProviders.push(provider);
        }
      } catch (error) {
        logger.debug(
          `Failed to get MCP servers from provider ${provider.name}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    }
    return availableProviders;
  }

  async importFromProvider(provider: McpConfigProvider): Promise<void> {
    const servers = await provider.getServers();
    const currentConfig = this.mcpHub.getCurrentConfig();
    const serversToImport: Array<McpServerConfig & { name: string }> = [];

    for (const [serverName, serverConfig] of Object.entries(servers)) {
      if (currentConfig[serverName]) {
        continue;
      }
      serversToImport.push({ name: serverName, ...serverConfig });
    }

    if (serversToImport.length === 0) {
      return;
    }
    this.mcpHub.addServers(serversToImport);
  }

  async importFromAllProviders(): Promise<void> {
    const availableProviders = await this.getAvailableProviders();
    const currentConfig = this.mcpHub.getCurrentConfig();
    const allServersToImport: Array<McpServerConfig & { name: string }> = [];

    for (const provider of availableProviders) {
      const servers = await provider.getServers();
      for (const [serverName, serverConfig] of Object.entries(servers)) {
        if (currentConfig[serverName]) {
          continue;
        }
        allServersToImport.push({ name: serverName, ...serverConfig });
      }
    }

    if (allServersToImport.length === 0) {
      return;
    }

    this.mcpHub.addServers(allServersToImport);
  }
}
