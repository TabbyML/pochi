import type { Command } from "@commander-js/extra-typings";
import { pochiConfig } from "@getpochi/common/configuration";
import { createCliMcpHub } from "../lib/mcp-hub-factory";
import chalk from "chalk";

export function registerMcpToolsCommand(parentCommand: Command) {
  parentCommand
    .command("tools")
    .description("List all available tools from MCP servers.")
    .argument("[server]", "Name of specific MCP server to list tools from")
    .option("--enabled-only", "Show only enabled tools")
    .option("--disabled-only", "Show only disabled tools")
    .action(async (serverName, options) => {
      try {
        await showMcpTools(serverName, options);
      } catch (error) {
        console.error(chalk.red(`Error listing MCP tools: ${error}`));
        process.exit(1);
      }
    });
}

async function showMcpTools(
  serverName?: string,
  options: { enabledOnly?: boolean; disabledOnly?: boolean } = {}
) {
  const mcpServers = pochiConfig.value.mcp || {};
  
  if (Object.keys(mcpServers).length === 0) {
    console.log(chalk.yellow("No MCP servers configured."));
    return;
  }
  
  if (serverName && !mcpServers[serverName]) {
    console.log(chalk.red(`MCP server "${serverName}" not found.`));
    return;
  }
  
  console.log(chalk.bold("\nMCP Tools\n"));
  
  // Create MCP hub to get real-time tool information
  const mcpHub = createCliMcpHub(process.cwd());
  
  // Wait a moment for connections to establish
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const status = mcpHub.status.value;
  
  // Filter servers based on provided server name
  const serversToShow = serverName 
    ? [serverName]
    : Object.keys(mcpServers).sort();
  
  let totalTools = 0;
  let totalEnabledTools = 0;
  
  for (const currentServerName of serversToShow) {
    const serverConfig = mcpServers[currentServerName];
    const connectionStatus = status.connections[currentServerName];
    
    console.log(chalk.bold(`📡 ${currentServerName}`));
    
    if (serverConfig.disabled) {
      console.log(`   ${chalk.gray("Server is disabled")}`);
      console.log();
      continue;
    }
    
    if (!connectionStatus || connectionStatus.status !== "ready") {
      const statusText = connectionStatus?.status || "unknown";
      const statusColor = getStatusColor(statusText);
      console.log(`   ${chalk.gray("Server status:")} ${statusColor(statusText)}`);
      
      if (connectionStatus?.error) {
        console.log(`   ${chalk.gray("Error:")} ${chalk.red(connectionStatus.error)}`);
      }
      console.log();
      continue;
    }
    
    const tools = Object.entries(connectionStatus.tools || {});
    
    if (tools.length === 0) {
      console.log(`   ${chalk.gray("No tools available")}`);
      console.log();
      continue;
    }
    
    // Filter tools based on options
    let filteredTools = tools;
    if (options.enabledOnly) {
      filteredTools = tools.filter(([, tool]) => !tool.disabled);
    } else if (options.disabledOnly) {
      filteredTools = tools.filter(([, tool]) => tool.disabled);
    }
    
    if (filteredTools.length === 0) {
      const filterText = options.enabledOnly ? "enabled" : "disabled";
      console.log(`   ${chalk.gray(`No ${filterText} tools`)}`);
      console.log();
      continue;
    }
    
    totalTools += tools.length;
    totalEnabledTools += tools.filter(([, tool]) => !tool.disabled).length;
    
    // Display tools
    for (const [toolName, tool] of filteredTools) {
      const toolStatus = tool.disabled 
        ? chalk.red("disabled")
        : chalk.green("enabled");
      
      console.log(`   🔧 ${chalk.cyan(toolName)} (${toolStatus})`);
      
      if (tool.description) {
        console.log(`      ${chalk.gray(tool.description)}`);
      }
      
      // Show input schema summary
      if (tool.inputSchema?.jsonSchema) {
        const schema = tool.inputSchema.jsonSchema;
        const properties = schema.properties ? Object.keys(schema.properties) : [];
        
        if (properties.length > 0) {
          const requiredProps = Array.isArray(schema.required) ? schema.required : [];
          const propSummary = properties.map(prop => {
            const isRequired = requiredProps.includes(prop);
            return isRequired ? chalk.bold(prop) : prop;
          }).join(", ");
          
          console.log(`      ${chalk.gray("Parameters:")} ${propSummary}`);
        }
      }
      
      console.log();
    }
  }
  
  // Summary
  if (!serverName && totalTools > 0) {
    console.log(chalk.bold(`📋 Summary:`));
    console.log(`   Total tools: ${totalTools}`);
    console.log(`   Enabled: ${chalk.green(totalEnabledTools)}`);
    console.log(`   Disabled: ${chalk.red(totalTools - totalEnabledTools)}`);
  }
  
  // Cleanup
  mcpHub.dispose();
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
