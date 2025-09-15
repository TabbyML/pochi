import * as assert from "assert";
import { describe, it } from "mocha";
import type { McpServerConfig } from "@getpochi/common/configuration";

describe("MCP Hub Tests", () => {
  describe("McpServerConfig validation", () => {
    it("should accept valid stdio config", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: false,
        disabledTools: ["tool1"]
      };
      assert.ok(config.command);
      assert.ok(Array.isArray(config.args));
      assert.strictEqual(typeof config.disabled, "boolean");
    });

    it("should accept valid http config", () => {
      const config: McpServerConfig = {
        url: "http://localhost:3000",
        disabled: false
      };
      assert.ok(config.url);
      assert.strictEqual(typeof config.disabled, "boolean");
    });

    it("should accept config with optional properties", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: true,
        disabledTools: ["tool1", "tool2"]
      };
      assert.strictEqual(config.disabled, true);
      assert.ok('command' in config);
      assert.ok(Array.isArray(config.disabledTools));
    });

    it("should validate stdio transport properties", () => {
      const stdioConfig: McpServerConfig = {
        command: "python",
        args: ["-m", "server"],
        env: { PYTHONPATH: "/path/to/modules" },
        disabled: false
      };
      
      assert.ok(stdioConfig.command);
      assert.ok(Array.isArray(stdioConfig.args));
      assert.ok(typeof stdioConfig.env === "object");
      assert.ok(!('url' in stdioConfig));
    });

    it("should validate http transport properties", () => {
      const httpConfig: McpServerConfig = {
        url: "https://api.example.com/mcp",
        disabled: false,
        disabledTools: []
      };
      
      assert.ok(httpConfig.url);
      assert.ok(httpConfig.url.startsWith("http"));
      assert.ok(!('command' in httpConfig));
      assert.ok(!('args' in httpConfig));
    });

    it("should handle mixed configuration scenarios", () => {
      // Test configuration with all optional fields
      const fullConfig: McpServerConfig = {
        command: "node",
        args: ["--experimental-modules", "server.mjs"],
        env: { 
          NODE_ENV: "development",
          DEBUG: "mcp:*" 
        },
        disabled: false,
        disabledTools: ["dangerous-tool", "experimental-feature"]
      };
      
      assert.ok(fullConfig.command);
      assert.strictEqual(fullConfig.args.length, 2);
      assert.ok(fullConfig.env);
      assert.strictEqual(Object.keys(fullConfig.env).length, 2);
      assert.ok(Array.isArray(fullConfig.disabledTools));
      assert.strictEqual(fullConfig.disabledTools.length, 2);
    });

    it("should validate minimal configurations", () => {
      const minimalStdio: McpServerConfig = {
        command: "mcp-server",
        args: [],
        disabled: false
      };
      
      const minimalHttp: McpServerConfig = {
        url: "http://localhost:8080",
        disabled: false
      };
      
      assert.ok(minimalStdio.command);
      assert.ok(Array.isArray(minimalStdio.args));
      assert.ok(minimalHttp.url);
    });

    it("should handle disabled server configurations", () => {
      const disabledConfig: McpServerConfig = {
        command: "disabled-server",
        args: ["--config", "test.json"],
        disabled: true,
        disabledTools: ["all"]
      };
      
      assert.strictEqual(disabledConfig.disabled, true);
      assert.ok(disabledConfig.command); // Should still have valid config even when disabled
      assert.ok(Array.isArray(disabledConfig.disabledTools));
    });
  });

  describe("Configuration type safety", () => {
    it("should ensure type safety for stdio configs", () => {
      const config: McpServerConfig = {
        command: "test-command",
        args: ["arg1", "arg2"],
        disabled: false
      };
      
      // Type assertions to ensure proper typing
      assert.strictEqual(typeof config.command, "string");
      assert.ok(Array.isArray(config.args));
      config.args.forEach(arg => assert.strictEqual(typeof arg, "string"));
      assert.strictEqual(typeof config.disabled, "boolean");
    });

    it("should ensure type safety for http configs", () => {
      const config: McpServerConfig = {
        url: "http://example.com",
        disabled: false
      };
      
      assert.strictEqual(typeof config.url, "string");
      assert.strictEqual(typeof config.disabled, "boolean");
    });

    it("should handle optional environment variables", () => {
      const config: McpServerConfig = {
        command: "env-test",
        args: [],
        env: {
          "VAR1": "value1",
          "VAR2": "value2"
        },
        disabled: false
      };
      
      assert.ok(config.env);
      assert.strictEqual(typeof config.env, "object");
      Object.entries(config.env).forEach(([key, value]) => {
        assert.strictEqual(typeof key, "string");
        assert.strictEqual(typeof value, "string");
      });
    });
  });
});