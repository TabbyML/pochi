import { BaseFileMcpProvider } from "./base-file-provider";

export class ClineMcpProvider extends BaseFileMcpProvider {
  readonly name = "Cline";
  readonly description = "Cline MCP configuration";
  protected readonly pathSegments = {
    darwin: [
      "~",
      "Library",
      "Application Support",
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings",
      "cline_mcp_settings.json",
    ],
    linux: [
      "~",
      ".config",
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings",
      "cline_mcp_settings.json",
    ],
    win32: [
      "%APPDATA%",
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings",
      "cline_mcp_settings.json",
    ],
  };
}
