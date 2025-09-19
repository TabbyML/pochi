import type { Command } from "@commander-js/extra-typings";
import { pochiConfig, updatePochiConfig } from "@getpochi/common/configuration";
import chalk from "chalk";

export function registerMcpRemoveCommand(parentCommand: Command) {
  parentCommand
    .command("remove")
    .description("Remove an MCP server configuration.")
    .argument("[name]", "Name of the MCP server to remove")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (name, options) => {
      try {
        const serverName = await getServerToRemove(name);

        if (!options.yes) {
          console.log(
            chalk.yellow(
              "Operation cancelled. Use --yes flag to skip confirmation.",
            ),
          );
          return;
        }

        await removeMcpServer(serverName);
        console.log(
          chalk.green(`✓ Successfully removed MCP server "${serverName}"`),
        );
      } catch (error) {
        console.error(chalk.red(`Error removing MCP server: ${error}`));
        process.exit(1);
      }
    });
}

async function getServerToRemove(providedName?: string): Promise<string> {
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
  throw new Error(
    "Server name is required. Use: pochi mcp remove <server-name>",
  );
}

async function removeMcpServer(name: string) {
  const currentConfig = pochiConfig.value.mcp || {};
  const { [name]: removed, ...newConfig } = currentConfig;

  await updatePochiConfig({ mcp: newConfig });
}
