import type { Command } from "@commander-js/extra-typings";
import {
  type McpServerConfig,
  pochiConfig,
  updatePochiConfig,
} from "@getpochi/common/configuration";
import chalk from "chalk";

export function registerMcpAddCommand(parentCommand: Command) {
  parentCommand
    .command("add")
    .description("Add a new MCP server configuration.")
    .argument("[name]", "Name for the MCP server")
    .option("--command <command>", "Command to run for stdio transport")
    .option("--args <args...>", "Arguments for the command")
    .option("--url <url>", "URL for HTTP transport")
    .option("--cwd <cwd>", "Working directory for stdio transport")
    .option("--disabled", "Add server in disabled state")
    .option("--non-interactive", "Run in non-interactive mode")
    .action(async (name, options) => {
      try {
        const config = await collectServerConfig(name, options);
        await addMcpServer(config.name, config.serverConfig);

        console.log(
          chalk.green(`✓ Successfully added MCP server "${config.name}"`),
        );

        if (!config.serverConfig.disabled) {
          console.log(
            chalk.blue("  Server will be started on next task execution."),
          );
        }
      } catch (error) {
        console.error(chalk.red(`Error adding MCP server: ${error}`));
        process.exit(1);
      }
    });
}

interface ServerConfigResult {
  name: string;
  serverConfig: McpServerConfig;
}

async function collectServerConfig(
  providedName?: string,
  options: {
    command?: string;
    args?: string[];
    url?: string;
    cwd?: string;
    disabled?: boolean;
    nonInteractive?: boolean;
  } = {},
): Promise<ServerConfigResult> {
  // Get server name
  const name = providedName;
  if (!name) {
    throw new Error("Server name is required");
  }

  // Check if server already exists
  if (pochiConfig.value.mcp?.[name]) {
    throw new Error(`Server "${name}" already exists`);
  }

  // Determine transport type
  let transportType: "stdio" | "http";

  if (options.command && options.url) {
    throw new Error("Cannot specify both --command and --url");
  }
  if (options.command) {
    transportType = "stdio";
  } else if (options.url) {
    transportType = "http";
  } else {
    throw new Error("Must specify either --command or --url");
  }

  let serverConfig: McpServerConfig;

  if (transportType === "stdio") {
    if (!options.command) {
      throw new Error("Command is required for stdio transport");
    }

    serverConfig = {
      command: options.command,
      args: Array.isArray(options.args) ? options.args : [],
      disabled: options.disabled || false,
    };

    if (options.cwd) {
      serverConfig.cwd = options.cwd;
    }
  } else {
    if (!options.url) {
      throw new Error("URL is required for HTTP transport");
    }

    serverConfig = {
      url: options.url,
      disabled: options.disabled || false,
    };
  }

  return { name, serverConfig };
}

async function addMcpServer(name: string, serverConfig: McpServerConfig) {
  const currentConfig = pochiConfig.value.mcp || {};
  const newConfig = {
    ...currentConfig,
    [name]: serverConfig,
  };

  await updatePochiConfig({ mcp: newConfig });
}
