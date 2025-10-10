import { VendorTools } from "@/lib/vendor-tools";
import { pochiConfig } from "@getpochi/common/configuration";
import { McpHub } from "@getpochi/common/mcp-utils";
import { computed } from "@preact/signals-core";
import type { DependencyContainer } from "tsyringe";

/**
 * Creates a McpHub instance configured for VSCode environment
 * @param container Dependency injection container
 * @returns Configured McpHub instance
 */
export function createMcpHub(container: DependencyContainer): McpHub {
  const vendorTools = container.resolve(VendorTools);
  // Create a computed signal for MCP servers configuration
  const config = computed(() => pochiConfig.value.mcp || {});

  const mcpHub = new McpHub({
    config,
    vendorTools: vendorTools.tools,
  });

  return mcpHub;
}
