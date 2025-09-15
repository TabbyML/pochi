import * as assert from "assert";
import { describe, it } from "mocha";
import {
  isStdioTransport,
  isHttpTransport,
  isExecutable,
  omitDisabled,
  type McpToolExecutable,
} from "@getpochi/common/mcp-utils";
import type { McpServerConfig } from "@getpochi/common/configuration";
import type { McpToolStatus } from "@getpochi/common/mcp-utils";

describe("MCP Types", () => {
  describe("isStdioTransport", () => {
    it("should return true for stdio transport config", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
      };

      const result = isStdioTransport(config);
      assert.strictEqual(result, true);
    });

    it("should return false for http transport config", () => {
      const config: McpServerConfig = {
        url: "http://localhost:3000",
      };

      const result = isStdioTransport(config);
      assert.strictEqual(result, false);
    });

    it("should return true for stdio config with additional properties", () => {
      const config: McpServerConfig = {
        command: "python",
        args: ["-m", "my_server"],
        env: { DEBUG: "1" },
        disabled: false,
        disabledTools: ["tool1"],
      };

      const result = isStdioTransport(config);
      assert.strictEqual(result, true);
    });
  });

  describe("isHttpTransport", () => {
    it("should return true for http transport config", () => {
      const config: McpServerConfig = {
        url: "http://localhost:3000",
      };

      const result = isHttpTransport(config);
      assert.strictEqual(result, true);
    });

    it("should return false for stdio transport config", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
      };

      const result = isHttpTransport(config);
      assert.strictEqual(result, false);
    });

    it("should return true for http config with additional properties", () => {
      const config: McpServerConfig = {
        url: "https://api.example.com/mcp",
        headers: {
          "Authorization": "Bearer token",
          "Content-Type": "application/json",
        },
        disabled: false,
        disabledTools: ["tool1"],
      };

      const result = isHttpTransport(config);
      assert.strictEqual(result, true);
    });

    it("should return false for config with both command and url", () => {
      // This shouldn't happen in practice, but test the type guard behavior
      const config = {
        command: "node",
        args: ["server.js"],
        url: "http://localhost:3000",
      } as any;

      const result = isHttpTransport(config);
      assert.strictEqual(result, false);
    });
  });

  describe("isExecutable", () => {
    it("should return true for tool with execute function", () => {
      const tool: McpToolExecutable = {
        execute: async () => "result",
      };

      const result = isExecutable(tool);
      assert.strictEqual(result, true);
    });

    it("should return false for tool without execute function", () => {
      const tool: McpToolExecutable = {};

      const result = isExecutable(tool);
      assert.strictEqual(result, false);
    });

    it("should return false for tool with non-function execute property", () => {
      const tool = {
        execute: "not a function",
      } as any;

      const result = isExecutable(tool);
      assert.strictEqual(result, false);
    });

    it("should return false for null or undefined tool", () => {
      assert.strictEqual(isExecutable(null as any), false);
      assert.strictEqual(isExecutable(undefined as any), false);
    });

    it("should return true and narrow type correctly", () => {
      const tool: McpToolExecutable = {
        execute: async (args: unknown, _options?: any) => `processed: ${JSON.stringify(args)}`,
      };

      if (isExecutable(tool)) {
        // TypeScript should know that tool.execute is defined here
        const result = tool.execute({ test: "data" }, { toolCallId: "test", messages: [] });
        assert.ok(result instanceof Promise);
      } else {
        assert.fail("Tool should be executable");
      }
    });
  });

  describe("omitDisabled", () => {
    it("should remove disabled property from tool status", () => {
      const tool: McpToolStatus = {
        disabled: true,
        description: "Test tool",
        inputSchema: {
          jsonSchema: {
            type: "object",
            properties: {
              input: { type: "string" },
            },
          },
        },
      };

      const result = omitDisabled(tool);

      assert.ok(!("disabled" in result));
      assert.strictEqual(result.description, "Test tool");
      assert.deepStrictEqual(result.inputSchema, tool.inputSchema);
    });

    it("should preserve all other properties", () => {
      const tool: McpToolStatus & { customProp: string } = {
        disabled: false,
        description: "Test tool",
        inputSchema: {
          jsonSchema: {
            type: "object",
            properties: {
              input: { type: "string" },
            },
          },
        },
        customProp: "custom value",
      };

      const result = omitDisabled(tool);

      assert.ok(!("disabled" in result));
      assert.strictEqual(result.description, "Test tool");
      assert.strictEqual((result as any).customProp, "custom value");
      assert.deepStrictEqual(result.inputSchema, tool.inputSchema);
    });

    it("should work with complex tool status objects", () => {
      const tool: McpToolStatus = {
        disabled: true,
        description: "Complex test tool with detailed schema",
        inputSchema: {
          jsonSchema: {
            type: "object",
            properties: {
              input: {
                type: "string",
                description: "Input parameter",
              },
              options: {
                type: "object",
                properties: {
                  verbose: { type: "boolean" },
                  timeout: { type: "number" },
                },
                required: ["verbose"],
              },
            },
            required: ["input"],
          },
        },
      };

      const result = omitDisabled(tool);

      assert.ok(!("disabled" in result));
      assert.strictEqual(result.description, tool.description);
      assert.deepStrictEqual(result.inputSchema, tool.inputSchema);
    });
  });

  describe("McpServerConfig type validation", () => {
    it("should accept valid stdio config", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["--version"],
        env: { NODE_ENV: "production" },
        disabled: false,
        disabledTools: ["dangerous-tool"],
      };

      // If this compiles, the type is correct
      assert.ok(config);
    });

    it("should accept valid http config", () => {
      const config: McpServerConfig = {
        url: "https://api.example.com/mcp",
        headers: {
          "Authorization": "Bearer secret",
          "User-Agent": "MCP Client",
        },
        disabled: true,
        disabledTools: [],
      };

      // If this compiles, the type is correct
      assert.ok(config);
    });

    it("should accept minimal stdio config", () => {
      const config: McpServerConfig = {
        command: "echo",
        args: ["hello"],
      };

      // If this compiles, the type is correct
      assert.ok(config);
    });

    it("should accept minimal http config", () => {
      const config: McpServerConfig = {
        url: "http://localhost:8080",
      };

      // If this compiles, the type is correct
      assert.ok(config);
    });
  });
});
