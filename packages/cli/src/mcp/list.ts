import type { Command } from "@commander-js/extra-typings";
import { pochiConfig } from "@getpochi/common/configuration";
import chalk from "chalk";

export function registerMcpListCommand(parentCommand: Command) {
  parentCommand
    .command("list", { isDefault: true })
    .description("List configured MCP servers")
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

      // Calculate column widths for proper alignment
      const maxNameLength = Math.max(
        ...sortedServerEntries.map(([name]) => name.length),
        4, // minimum for "NAME" header
      );
      const statusWidth = 8; // "STATUS" header length
      const transportWidth = 9; // "TRANSPORT" header length

      // Calculate max details width if we have disabled tools column
      let maxDetailsLength = 7; // minimum for "DETAILS" header
      if (hasDisabledTools) {
        for (const [, serverConfig] of sortedServerEntries) {
          let details = "";
          if ("url" in serverConfig) {
            details = serverConfig.url;
            if (
              serverConfig.headers &&
              Object.keys(serverConfig.headers).length > 0
            ) {
              details += ` (headers: ${Object.keys(serverConfig.headers).join(", ")})`;
            }
          } else {
            details = `${serverConfig.command} ${serverConfig.args.join(" ")}`;
            if (serverConfig.cwd) {
              details += ` (cwd: ${serverConfig.cwd})`;
            }
            if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
              details += ` (env: ${Object.keys(serverConfig.env).join(", ")})`;
            }
          }
          maxDetailsLength = Math.max(maxDetailsLength, details.length);
        }
      }

      const disabledToolsWidth = hasDisabledTools ? 15 : 0; // "DISABLED TOOLS" header length

      // Print table header with consistent spacing
      const nameHeader = "NAME".padEnd(maxNameLength);
      const statusHeader = "STATUS".padEnd(statusWidth);
      const transportHeader = "TRANSPORT".padEnd(transportWidth);
      const disabledToolsHeader = hasDisabledTools
        ? "DISABLED TOOLS".padEnd(disabledToolsWidth)
        : "";

      let headerLine: string;
      if (hasDisabledTools) {
        const detailsHeader = "DETAILS".padEnd(maxDetailsLength);
        headerLine = `${chalk.bold(nameHeader)} ${chalk.bold(statusHeader)} ${chalk.bold(transportHeader)} ${chalk.bold(detailsHeader)} ${chalk.bold(disabledToolsHeader)}`;
      } else {
        headerLine = `${chalk.bold(nameHeader)} ${chalk.bold(statusHeader)} ${chalk.bold(transportHeader)} ${chalk.bold("DETAILS")}`;
      }
      console.log(headerLine);

      // Print separator line
      const separatorLength =
        maxNameLength +
        statusWidth +
        transportWidth +
        (hasDisabledTools ? maxDetailsLength : 20) + // min width for DETAILS when no disabled tools
        (hasDisabledTools ? disabledToolsWidth : 0) +
        (hasDisabledTools ? 5 : 3); // spaces between columns
      const separator = "-".repeat(separatorLength);
      console.log(`${chalk.gray(separator)}`);
      for (const [serverName, serverConfig] of sortedServerEntries) {
        const statusText = serverConfig.disabled ? "❌" : "✓";
        const statusColored = serverConfig.disabled
          ? chalk.red(statusText)
          : chalk.green(statusText);
        const transport = "url" in serverConfig ? "HTTP" : "stdio";

        let details = "";
        if ("url" in serverConfig) {
          details = serverConfig.url;
        } else {
          details = `${serverConfig.command} ${serverConfig.args.join(" ")}`;
        }

        const disabledToolsText =
          serverConfig.disabledTools && serverConfig.disabledTools.length > 0
            ? serverConfig.disabledTools.join(", ")
            : "-";

        // Format columns with proper padding
        const namePadded = serverName.padEnd(maxNameLength);
        const statusPadded = statusColored.padEnd(
          statusWidth + (statusColored.length - statusText.length),
        );
        const transportPadded = transport.padEnd(transportWidth);
        const disabledToolsPadded = hasDisabledTools
          ? disabledToolsText.padEnd(disabledToolsWidth)
          : "";

        let outputLine: string;
        if (hasDisabledTools) {
          const detailsPadded = details.padEnd(maxDetailsLength);
          outputLine = `${namePadded} ${statusPadded} ${transportPadded} ${chalk.blue(detailsPadded)} ${chalk.gray(disabledToolsPadded)}`;
        } else {
          outputLine = `${namePadded} ${statusPadded} ${transportPadded} ${chalk.blue(details)}`;
        }

        console.log(outputLine);
      }
    });
}
