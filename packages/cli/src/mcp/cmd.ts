import type { Command } from "@commander-js/extra-typings";
import { registerMcpListCommand } from "./list";

export function registerMcpCommand(program: Command) {
  const mcpCommand = program
    .command("mcp")
    .description("Manage MCP (Model Context Protocol) servers");

  registerMcpListCommand(mcpCommand);

  return mcpCommand;
}
