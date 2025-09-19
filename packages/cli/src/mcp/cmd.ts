import type { Command } from "@commander-js/extra-typings";
import { registerMcpAddCommand } from "./add";
import { registerMcpDisableCommand, registerMcpEnableCommand } from "./enable-disable";
import { registerMcpListCommand } from "./list";
import { registerMcpRemoveCommand } from "./remove";
import { registerMcpRestartCommand } from "./restart";
import { registerMcpStatusCommand } from "./status";
import { registerMcpToolsCommand } from "./tools";

export function registerMcpCommand(program: Command) {
  const mcpCommand = program
    .command("mcp")
    .description("Manage Model Context Protocol (MCP) servers.")
    .addHelpCommand(true);

  registerMcpListCommand(mcpCommand);
  registerMcpStatusCommand(mcpCommand);
  registerMcpAddCommand(mcpCommand);
  registerMcpRemoveCommand(mcpCommand);
  registerMcpEnableCommand(mcpCommand);
  registerMcpDisableCommand(mcpCommand);
  registerMcpRestartCommand(mcpCommand);
  registerMcpToolsCommand(mcpCommand);

  return mcpCommand;
}
