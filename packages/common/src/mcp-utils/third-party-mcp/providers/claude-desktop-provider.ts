import { BaseFileMcpProvider } from "./base-file-provider";

export class ClaudeDesktopMcpProvider extends BaseFileMcpProvider {
  readonly name = "Claude Desktop";
  readonly description = "Claude Desktop MCP configuration";
  protected readonly pathSegments = {
    darwin: [
      "~",
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    ],
    linux: ["~", ".config", "Claude", "claude_desktop_config.json"],
    win32: ["%APPDATA%", "Claude", "claude_desktop_config.json"],
  };
}
