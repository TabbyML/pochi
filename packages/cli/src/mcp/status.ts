import type { Command } from "@commander-js/extra-typings";
import {
  type McpServerConfig,
  pochiConfig,
} from "@getpochi/common/configuration";
import chalk from "chalk";
import { createCliMcpHub } from "../lib/mcp-hub-factory";

export function registerMcpStatusCommand(parentCommand: Command) {
  parentCommand
    .command("status")
    .description(
      "Show detailed status of all MCP servers and their connections.",
    )
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
  const mcpHub = createCliMcpHub();

  // Wait for connections to establish with retry logic
  let status = mcpHub.status.value;
  let attempts = 0;
  const maxAttempts = 15; // Increase max attempts for slower servers

  while (attempts < maxAttempts) {
    status = mcpHub.status.value;
    const connections = Object.values(status.connections);
    const allConnections = connections.length;
    const readyConnections = connections.filter(
      (conn) => conn.status === "ready",
    ).length;
    const errorConnections = connections.filter(
      (conn) => conn.status === "error",
    ).length;

    // Wait for ALL non-error connections to be ready, not just when we have some tools
    if (readyConnections + errorConnections >= allConnections) {
      // Give a bit more time for all tools to be fully loaded after connections are ready
      if (attempts > 8) {
        break;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 600));
    attempts++;
  }

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

      // Tools info - show tools even in starting state if available
      const tools = connectionStatus.tools || {};
      const toolCount = Object.keys(tools).length;

      const enabledTools = Object.values(tools).filter(
        (tool) => !tool.disabled,
      ).length;

      if (toolCount > 0) {
        console.log(
          `   Tools:  ${chalk.green(enabledTools)}/${toolCount} enabled`,
        );

        // List individual tools if not too many
        if (toolCount <= 10) {
          const toolEntries = Object.entries(tools);
          for (const [toolName, tool] of toolEntries) {
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
    console.log(
      chalk.bold(`📋 Total Available Tools: ${chalk.green(totalTools)}`),
    );
    if (status.instructions) {
      console.log(
        chalk.bold(`📝 Custom Instructions: ${chalk.blue("Available")}`),
      );
    }
  }

  // Cleanup
  mcpHub.dispose();
}

async function watchMcpStatus() {
  console.log(
    chalk.blue("👀 Watching MCP server status... (Press Ctrl+C to exit)"),
  );
  console.log(
    chalk.gray(
      "Note: Watch mode is experimental and may not show real-time updates\n",
    ),
  );

  const mcpHub = createCliMcpHub();

  // Initial status
  await showMcpStatus();

  // Subscribe to status changes
  mcpHub.status.subscribe((status) => {
    console.clear();
    console.log(
      chalk.blue("👀 Watching MCP server status... (Press Ctrl+C to exit)"),
    );
    console.log(
      chalk.gray(`Last updated: ${new Date().toLocaleTimeString()}\n`),
    );
    showMcpStatus();
  });

  // Handle cleanup on exit
  process.on("SIGINT", () => {
    console.log(chalk.yellow("\nStopping watch mode..."));
    mcpHub.dispose();
    process.exit(0);
  });
}

function getConfigInfo(serverConfig: McpServerConfig): string {
  if ("url" in serverConfig) {
    return `HTTP ${serverConfig.url}`;
  }
  if ("command" in serverConfig) {
    const args = serverConfig.args?.length
      ? ` ${serverConfig.args.join(" ")}`
      : "";
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
    default:
      return chalk.gray;
  }
}
