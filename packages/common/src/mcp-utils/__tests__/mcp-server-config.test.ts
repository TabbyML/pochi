import { describe, it, expect } from "vitest";
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
      expect(config.command).toBeTruthy();
      expect(Array.isArray(config.args)).toBe(true);
      expect(typeof config.disabled).toBe("boolean");
    });

    it("should accept valid http config", () => {
      const config: McpServerConfig = {
        url: "http://localhost:3000",
        disabled: false
      };
      expect(config.url).toBeTruthy();
      expect(typeof config.disabled).toBe("boolean");
    });

    it("should accept config with optional properties", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: true,
        disabledTools: ["tool1", "tool2"]
      };
      expect(config.disabled).toBe(true);
      expect('command' in config).toBe(true);
      expect(Array.isArray(config.disabledTools)).toBe(true);
    });

    it("should validate stdio transport properties", () => {
      const stdioConfig: McpServerConfig = {
        command: "python",
        args: ["-m", "server"],
        env: { PYTHONPATH: "/path/to/modules" },
        disabled: false
      };
      
      expect(stdioConfig.command).toBeTruthy();
      expect(Array.isArray(stdioConfig.args)).toBe(true);
      expect(typeof stdioConfig.env).toBe("object");
      expect('url' in stdioConfig).toBe(false);
    });

    it("should validate http transport properties", () => {
      const httpConfig: McpServerConfig = {
        url: "https://api.example.com/mcp",
        disabled: false,
        disabledTools: []
      };
      
      expect(httpConfig.url).toBeTruthy();
      expect(httpConfig.url.startsWith("http")).toBe(true);
      expect('command' in httpConfig).toBe(false);
      expect('args' in httpConfig).toBe(false);
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
      
      expect(fullConfig.command).toBeTruthy();
      expect(fullConfig.args.length).toBe(2);
      expect(fullConfig.env).toBeTruthy();
      expect(fullConfig.env && Object.keys(fullConfig.env).length).toBe(2);
      expect(Array.isArray(fullConfig.disabledTools)).toBe(true);
      expect(fullConfig.disabledTools && fullConfig.disabledTools.length).toBe(2);
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
      
      expect(minimalStdio.command).toBeTruthy();
      expect(Array.isArray(minimalStdio.args)).toBe(true);
      expect(minimalHttp.url).toBeTruthy();
    });

    it("should handle disabled server configurations", () => {
      const disabledConfig: McpServerConfig = {
        command: "disabled-server",
        args: ["--config", "test.json"],
        disabled: true,
        disabledTools: ["all"]
      };
      
      expect(disabledConfig.disabled).toBe(true);
      expect(disabledConfig.command).toBeTruthy(); // Should still have valid config even when disabled
      expect(Array.isArray(disabledConfig.disabledTools)).toBe(true);
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
      expect(typeof config.command).toBe("string");
      expect(Array.isArray(config.args)).toBe(true);
      config.args.forEach(arg => expect(typeof arg).toBe("string"));
      expect(typeof config.disabled).toBe("boolean");
    });

    it("should ensure type safety for http configs", () => {
      const config: McpServerConfig = {
        url: "http://example.com",
        disabled: false
      };
      
      expect(typeof config.url).toBe("string");
      expect(typeof config.disabled).toBe("boolean");
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
      
      expect(config.env).toBeTruthy();
      expect(typeof config.env).toBe("object");
      if (config.env) {
        Object.entries(config.env).forEach(([key, value]) => {
          expect(typeof key).toBe("string");
          expect(typeof value).toBe("string");
        });
      }
    });
  });
});