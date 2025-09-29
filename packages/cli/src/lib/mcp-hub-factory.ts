import { getLogger } from "@getpochi/common";
import { pochiConfig } from "@getpochi/common/configuration";
import { McpHub, type McpToolExecutable } from "@getpochi/common/mcp-utils";
import { getVendors } from "@getpochi/common/vendor";
import type { McpTool } from "@getpochi/tools";
import { computed, signal } from "@preact/signals-core";

const logger = getLogger("McpHubFactory");

/**
 * Creates a McpHub instance configured for CLI environment
 * @returns Configured McpHub instance
 */
export async function createCliMcpHub(): Promise<McpHub> {
  // Create a computed signal for MCP servers configuration
  const config = computed(() => pochiConfig.value.mcp || {});
  const vendorTools = signal<Record<string, VendorToolSet>>(await fetchTools());

  const mcpHub = new McpHub({
    config,
    vendorTools,
    clientName: "pochi-cli",
  });

  return mcpHub;
}

type VendorToolSet = Record<string, McpTool & McpToolExecutable>;

async function fetchTools(): Promise<Record<string, VendorToolSet>> {
  const toolsets: Record<string, VendorToolSet> = {};

  const vendors = getVendors();
  // From vendors
  for (const [vendorId, vendor] of Object.entries(vendors)) {
    if (vendor.authenticated) {
      try {
        const tools = await vendor.getTools();
        if (Object.keys(tools).length > 0) {
          toolsets[vendorId] = tools;
        }
      } catch (e) {
        logger.error(`Failed to fetch models for vendor ${vendorId}:`, e);
      }
    }
  }

  return toolsets;
}
