import { BaseFileMcpProvider } from "./base-file-provider";

export class RooCodeMcpProvider extends BaseFileMcpProvider {
  readonly name = "Roo Code";
  readonly description = "Roo Code MCP configuration";
  protected readonly pathSegments = {
    darwin: [
      "~",
      "Library",
      "Application Support",
      "Code",
      "User",
      "globalStorage",
      "rooveterinaryinc.roo-cline",
      "settings",
      "mcp_settings.json",
    ],
    linux: [
      "~",
      ".config",
      "Code",
      "User",
      "globalStorage",
      "rooveterinaryinc.roo-cline",
      "settings",
      "mcp_settings.json",
    ],
    win32: [
      "%APPDATA%",
      "Code",
      "User",
      "globalStorage",
      "rooveterinaryinc.roo-cline",
      "settings",
      "mcp_settings.json",
    ],
  };
}
