import type { Command } from "@commander-js/extra-typings";
import { pochiConfig } from "@getpochi/common/configuration";
import chalk from "chalk";
import Table from "cli-table3";

export function registerMcpListCommand(parentCommand: Command) {
  parentCommand
    .command("list", { isDefault: true })
    .description("List all configured MCP servers and their statuses.")
    .action(async () => {
      const mcpServers = pochiConfig.value.mcp || {};

      if (Object.keys(mcpServers).length === 0) {
        console.log(chalk.yellow("No MCP servers configured."));
        console.log(
          "To add MCP servers, edit your configuration file at ~/.pochi/config.jsonc",
        );
        return;
      }

      console.log();

      // Sort servers by name for consistent display
      const sortedServerEntries = Object.entries(mcpServers).sort(([a], [b]) =>
        a.localeCompare(b),
      );

      // Check if any server has disabled tools to determine if we need that column
      const hasDisabledTools = sortedServerEntries.some(
        ([, config]) => config.disabledTools && config.disabledTools.length > 0,
      );

      // Create table headers based on whether we have disabled tools
      const headers = ["NAME", "STATUS", "TRANSPORT", "DETAILS"];
      if (hasDisabledTools) {
        headers.push("DISABLED TOOLS");
      }

      // Create table with proper styling
      const table = new Table({
        head: headers.map((header) => chalk.bold(header)),
        style: {
          head: [],
          border: ["gray"],
          compact: false,
        },
        colWidths: hasDisabledTools ? [20, 10, 12, 40, 20] : [20, 10, 12, 50],
        wordWrap: true,
      });

      // Add rows to the table
      for (const [serverName, serverConfig] of sortedServerEntries) {
        const statusText = serverConfig.disabled ? "❌" : "✓";
        const statusColored = serverConfig.disabled
          ? chalk.red(statusText)
          : chalk.green(statusText);
        const transport = "url" in serverConfig ? "HTTP" : "stdio";

        let details = "";
        if ("url" in serverConfig) {
          details = serverConfig.url;
          if (
            serverConfig.headers &&
            Object.keys(serverConfig.headers).length > 0
          ) {
            details += `\n(headers: ${Object.keys(serverConfig.headers).join(", ")})`;
          }
        } else {
          details = `${serverConfig.command} ${serverConfig.args.join(" ")}`;
          if (serverConfig.cwd) {
            details += `\n(cwd: ${serverConfig.cwd})`;
          }
          if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
            details += `\n(env: ${Object.keys(serverConfig.env).join(", ")})`;
          }
        }

        const disabledToolsText =
          serverConfig.disabledTools && serverConfig.disabledTools.length > 0
            ? serverConfig.disabledTools.join(", ")
            : "-";

        // Create row data
        const rowData = [
          serverName,
          statusColored,
          transport,
          chalk.blue(details),
        ];

        if (hasDisabledTools) {
          rowData.push(chalk.gray(disabledToolsText));
        }

        table.push(rowData);
      }

      // Display the table
      console.log(table.toString());
    });
}
