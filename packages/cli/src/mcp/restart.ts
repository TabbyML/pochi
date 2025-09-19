import type { Command } from "@commander-js/extra-typings";
import { pochiConfig } from "@getpochi/common/configuration";
import { createCliMcpHub } from "../lib/mcp-hub-factory";
import chalk from "chalk";

export function registerMcpRestartCommand(parentCommand: Command) {
  parentCommand
    .command("restart")
    .description("Restart an MCP server connection.")
    .argument("[name]", "Name of the MCP server to restart")
    .action(async (name) => {
      try {
        const serverName = await getServerToRestart(name);
        await restartMcpServer(serverName);
        console.log(
          chalk.green(`✓ Successfully restarted MCP server "${serverName}"`)
        );
      } catch (error) {
        console.error(chalk.red(`Error restarting MCP server: ${error}`));
        process.exit(1);
      }
    });
}

async function getServerToRestart(providedName?: string): Promise<string> {
  const mcpServers = pochiConfig.value.mcp || {};
  const serverNames = Object.keys(mcpServers);
  
  if (serverNames.length === 0) {
    throw new Error("No MCP servers configured");
  }
  
  if (providedName) {
    if (!mcpServers[providedName]) {
      throw new Error(`MCP server "${providedName}" not found`);
    }
    return providedName;
  }
  
  // For now, require explicit server name
  throw new Error("Server name is required. Use: pochi mcp restart <server-name>");
}

function getServerDescription(config: any): string {
  if (config.url) {
    return `HTTP: ${config.url}`;
  } else if (config.command) {
    return `stdio: ${config.command}`;
  }
  return "Unknown transport";
}

async function restartMcpServer(name: string) {
  const mcpServers = pochiConfig.value.mcp || {};
  
  if (!mcpServers[name]) {
    throw new Error(`MCP server "${name}" not found`);
  }
  
  const serverConfig = mcpServers[name];
  
  if (serverConfig.disabled) {
    throw new Error(`Cannot restart disabled MCP server "${name}". Enable it first.`);
  }
  
  console.log(chalk.blue(`Restarting MCP server "${name}"...`));
  
  // Create MCP hub to perform the restart
  const mcpHub = createCliMcpHub(process.cwd());
  
  // Wait a moment for the hub to initialize
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Restart the specific server
  mcpHub.restart(name);
  
  // Wait for restart to complete and verify status
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const status = mcpHub.status.value;
    const connectionStatus = status.connections[name];
    
    if (connectionStatus) {
      if (connectionStatus.status === "ready") {
        console.log(chalk.green(`Server "${name}" is now ready`));
        break;
      } else if (connectionStatus.status === "error") {
        const error = connectionStatus.error || "Unknown error";
        throw new Error(`Server restart failed: ${error}`);
      }
    }
    
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    console.log(chalk.yellow(`Restart initiated, but server status is still pending`));
  }
  
  // Cleanup
  mcpHub.dispose();
}
