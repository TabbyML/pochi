import type { McpServerConnection } from "../../mcp-utils";
import { describe, expect, it } from "vitest";
import { buildTaskScopedMcpInfo } from "../mcp-util";

describe("buildTaskScopedMcpInfo", () => {
  it("keeps vendor tools when task-scoped MCP overrides are applied", () => {
    const connections: Record<string, McpServerConnection> = {
      pochi: {
        kind: "vendor",
        status: "ready",
        error: undefined,
        tools: {
          webFetch: {
            description: "Fetch web content",
            disabled: false,
            inputSchema: {
              jsonSchema: { type: "object" },
            },
          },
        },
      },
      context7: {
        status: "ready",
        error: undefined,
        instructions: "Use Context7 docs.",
        tools: {
          resolveLibraryId: {
            description: "Resolve library id",
            disabled: false,
            inputSchema: {
              jsonSchema: { type: "object" },
            },
          },
          getLibraryDocs: {
            description: "Fetch library docs",
            disabled: false,
            inputSchema: {
              jsonSchema: { type: "object" },
            },
          },
        },
      },
    };

    const result = buildTaskScopedMcpInfo(connections, {
      context7: {
        disabledTools: ["getLibraryDocs"],
      },
    });

    expect(result.toolset.webFetch).toEqual({
      description: "Fetch web content",
      inputSchema: {
        jsonSchema: { type: "object" },
      },
    });
    expect(result.toolset.resolveLibraryId).toEqual({
      description: "Resolve library id",
      inputSchema: {
        jsonSchema: { type: "object" },
      },
    });
    expect(result.toolset.getLibraryDocs).toBeUndefined();
    expect(result.instructions).toBe(
      "# Instructions from context7 mcp server\nUse Context7 docs.",
    );
  });
});
