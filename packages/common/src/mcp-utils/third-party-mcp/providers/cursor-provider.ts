import { BaseFileMcpProvider } from "./base-file-provider";

export class CursorMcpProvider extends BaseFileMcpProvider {
  readonly name = "Cursor";
  readonly description = "Cursor MCP configuration";
  protected readonly pathSegments = {
    darwin: ["~", ".cursor", "mcp.json"],
    linux: ["~", ".cursor", "mcp.json"],
    win32: ["%USERPROFILE%", ".cursor", "mcp.json"],
  };
}
