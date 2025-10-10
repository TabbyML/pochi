import type { Command } from "@commander-js/extra-typings";
import { registerMcpListCommand } from "./list";

export function registerMcpCommand(program: Command) {
  const mcpCommand = program
    .command("mcp")
    .description("Manage Model Context Protocol (MCP) servers.")
    .addHelpCommand(true);

  registerMcpListCommand(mcpCommand);

  return mcpCommand;
}
