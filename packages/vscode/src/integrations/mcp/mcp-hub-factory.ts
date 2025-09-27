import { VendorTools } from "@/lib/vendor-tools";
import { pochiConfig } from "@getpochi/common/configuration";
import { McpHub } from "@getpochi/common/mcp-utils";
import { computed } from "@preact/signals-core";
import type { DependencyContainer } from "tsyringe";
import type * as vscode from "vscode";

/**
 * Creates a McpHub instance configured for VSCode environment
 * @param container Dependency injection container
 * @returns Configured McpHub instance
 */
export function createMcpHub(container: DependencyContainer): McpHub {
  const context = container.resolve<vscode.ExtensionContext>(
    "vscode.ExtensionContext",
  );

  const vendorTools = container.resolve(VendorTools);

  // Create a computed signal for MCP servers configuration
  const mcpServersSignal = computed(() => pochiConfig.value.mcp || {});

  const mcpHub = new McpHub({
    configSignal: mcpServersSignal,
    vendorToolsSignal: vendorTools.tools,
    clientName: context.extension.id,
  });

  // Register for cleanup when context is disposed
  context.subscriptions.push(mcpHub);

  return mcpHub;
}
