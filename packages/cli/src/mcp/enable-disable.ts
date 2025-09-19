import type { Command } from "@commander-js/extra-typings";
import { pochiConfig, updatePochiConfig } from "@getpochi/common/configuration";
import chalk from "chalk";

export function registerMcpEnableCommand(parentCommand: Command) {
  parentCommand
    .command("enable")
    .description("Enable an MCP server.")
    .argument("[name]", "Name of the MCP server to enable")
    .action(async (name) => {
      try {
        const serverName = await getServerToToggle(name, "disabled");
        await toggleMcpServer(serverName, false);
        console.log(
          chalk.green(`✓ Successfully enabled MCP server "${serverName}"`),
        );
      } catch (error) {
        console.error(chalk.red(`Error enabling MCP server: ${error}`));
        process.exit(1);
      }
    });
}

export function registerMcpDisableCommand(parentCommand: Command) {
  parentCommand
    .command("disable")
    .description("Disable an MCP server.")
    .argument("[name]", "Name of the MCP server to disable")
    .action(async (name) => {
      try {
        const serverName = await getServerToToggle(name, "enabled");
        await toggleMcpServer(serverName, true);
        console.log(
          chalk.green(`✓ Successfully disabled MCP server "${serverName}"`),
        );
      } catch (error) {
        console.error(chalk.red(`Error disabling MCP server: ${error}`));
        process.exit(1);
      }
    });
}

async function getServerToToggle(
  providedName?: string,
  filter: "enabled" | "disabled" | "all" = "all",
): Promise<string> {
  const mcpServers = pochiConfig.value.mcp || {};
  let serverNames = Object.keys(mcpServers);

  if (serverNames.length === 0) {
    throw new Error("No MCP servers configured");
  }

  // Filter servers based on current state
  if (filter === "enabled") {
    serverNames = serverNames.filter((name) => !mcpServers[name].disabled);
  } else if (filter === "disabled") {
    serverNames = serverNames.filter((name) => mcpServers[name].disabled);
  }

  if (serverNames.length === 0) {
    const filterText = filter === "enabled" ? "enabled" : "disabled";
    throw new Error(`No ${filterText} MCP servers found`);
  }

  if (providedName) {
    if (!mcpServers[providedName]) {
      throw new Error(`MCP server "${providedName}" not found`);
    }

    // Check if server matches filter
    const isDisabled = mcpServers[providedName].disabled;
    if (filter === "enabled" && isDisabled) {
      throw new Error(`MCP server "${providedName}" is already disabled`);
    }
    if (filter === "disabled" && !isDisabled) {
      throw new Error(`MCP server "${providedName}" is already enabled`);
    }

    return providedName;
  }

  // For now, require explicit server name
  const action = filter === "enabled" ? "disable" : "enable";
  throw new Error(
    `Server name is required. Use: pochi mcp ${action} <server-name>`,
  );
}

async function toggleMcpServer(name: string, disabled: boolean) {
  const currentConfig = pochiConfig.value.mcp || {};
  const serverConfig = currentConfig[name];

  if (!serverConfig) {
    throw new Error(`MCP server "${name}" not found`);
  }

  const newConfig = {
    ...currentConfig,
    [name]: {
      ...serverConfig,
      disabled,
    },
  };

  await updatePochiConfig({ mcp: newConfig });
}
