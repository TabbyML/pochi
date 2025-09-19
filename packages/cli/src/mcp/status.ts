import type { Command } from "@commander-js/extra-typings";
import { pochiConfig } from "@getpochi/common/configuration";
import { createCliMcpHub } from "../lib/mcp-hub-factory";
import chalk from "chalk";

export function registerMcpStatusCommand(parentCommand: Command) {
  parentCommand
    .command("status")
    .description("Show detailed status of all MCP servers and their connections.")
    .option("--watch", "Watch for status changes (experimental)")
    .action(async (options) => {
      try {
        if (options.watch) {
          await watchMcpStatus();
        } else {
          await showMcpStatus();
        }
      } catch (error) {
        console.error(chalk.red(`Error showing MCP status: ${error}`));
        process.exit(1);
      }
    });
}

async function showMcpStatus() {
  const mcpServers = pochiConfig.value.mcp || {};
  
  if (Object.keys(mcpServers).length === 0) {
    console.log(chalk.yellow("No MCP servers configured."));
    return;
  }
  
  console.log(chalk.bold("\nMCP Server Status\n"));
  
  // Create MCP hub to get real-time status
  const mcpHub = createCliMcpHub(process.cwd());
  
  // Wait a moment for connections to establish
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const status = mcpHub.status.value;

  console.log("status", status);
  
  // Sort servers by name for consistent display
  const sortedServerNames = Object.keys(mcpServers).sort();
  
  for (const serverName of sortedServerNames) {
    const serverConfig = mcpServers[serverName];
    const connectionStatus = status.connections[serverName];
    
    console.log(chalk.bold(`📡 ${serverName}`));
    
    // Configuration info
    const configInfo = getConfigInfo(serverConfig);
    console.log(`   Config: ${chalk.blue(configInfo)}`);
    
    // Status info
    if (serverConfig.disabled) {
      console.log(`   Status: ${chalk.gray("Disabled")}`);
    } else if (connectionStatus) {
      const statusColor = getStatusColor(connectionStatus.status);
      console.log(`   Status: ${statusColor(connectionStatus.status)}`);
      
      if (connectionStatus.error) {
        console.log(`   Error:  ${chalk.red(connectionStatus.error)}`);
      }
      
      // Tools info
      const toolCount = Object.keys(connectionStatus.tools || {}).length;
      const enabledTools = Object.values(connectionStatus.tools || {}).filter(
        tool => !tool.disabled
      ).length;
      
      if (toolCount > 0) {
        console.log(`   Tools:  ${chalk.green(enabledTools)}/${toolCount} enabled`);
        
        // List individual tools if not too many
        if (toolCount <= 10) {
          const tools = Object.entries(connectionStatus.tools || {});
          for (const [toolName, tool] of tools) {
            const toolStatus = tool.disabled 
              ? chalk.gray("disabled")
              : chalk.green("enabled");
            console.log(`     - ${toolName} (${toolStatus})`);
          }
        }
      } else {
        console.log(`   Tools:  ${chalk.gray("None available")}`);
      }
    } else {
      console.log(`   Status: ${chalk.yellow("Unknown")}`);
    }
    
    console.log(); // Empty line between servers
  }
  
  // Summary
  const totalTools = Object.values(status.toolset).length;
  if (totalTools > 0) {
    console.log(chalk.bold(`📋 Total Available Tools: ${chalk.green(totalTools)}`));
    if (status.instructions) {
      console.log(chalk.bold(`📝 Custom Instructions: ${chalk.blue("Available")}`));
    }
  }
  
  // Cleanup
  mcpHub.dispose();
}

async function watchMcpStatus() {
  console.log(chalk.blue("👀 Watching MCP server status... (Press Ctrl+C to exit)"));
  console.log(chalk.gray("Note: Watch mode is experimental and may not show real-time updates\n"));
  
  const mcpHub = createCliMcpHub(process.cwd());
  
  // Initial status
  await showMcpStatus();
  
  // Subscribe to status changes
  mcpHub.status.subscribe((status) => {
    console.clear();
    console.log(chalk.blue("👀 Watching MCP server status... (Press Ctrl+C to exit)"));
    console.log(chalk.gray(`Last updated: ${new Date().toLocaleTimeString()}\n`));
    showMcpStatus();
  });
  
  // Handle cleanup on exit
  process.on('SIGINT', () => {
    console.log(chalk.yellow("\nStopping watch mode..."));
    mcpHub.dispose();
    process.exit(0);
  });
}

function getConfigInfo(serverConfig: any): string {
  if (serverConfig.url) {
    return `HTTP ${serverConfig.url}`;
  } else if (serverConfig.command) {
    const args = serverConfig.args?.length ? ` ${serverConfig.args.join(' ')}` : '';
    return `stdio ${serverConfig.command}${args}`;
  }
  return "Unknown transport";
}

function getStatusColor(status: string): (text: string) => string {
  switch (status) {
    case "ready":
      return chalk.green;
    case "starting":
      return chalk.yellow;
    case "error":
      return chalk.red;
    case "stopped":
    default:
      return chalk.gray;
  }
}
