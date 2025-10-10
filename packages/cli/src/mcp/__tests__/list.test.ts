import { describe, expect, it, beforeEach } from "vitest";
import { registerMcpListCommand } from "../list";
import { Command } from "@commander-js/extra-typings";

// Create a simple test without mocking the configuration for now
describe("mcp list command", () => {
  let program: Command;

  beforeEach(() => {
    program = new Command("test");
    registerMcpListCommand(program);
  });

  it("should register the list command correctly", () => {
    const listCommand = program.commands.find(cmd => cmd.name() === "list");
    expect(listCommand).toBeDefined();
    expect(listCommand?.description()).toBe("List all configured MCP servers and their statuses.");
  });

  it("should have the correct command structure", () => {
    const listCommand = program.commands.find(cmd => cmd.name() === "list");
    expect(listCommand?.name()).toBe("list");
    expect(typeof (listCommand as any)?._actionHandler).toBe("function");
  });
});
