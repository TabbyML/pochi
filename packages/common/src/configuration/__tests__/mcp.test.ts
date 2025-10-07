import { describe, expect, it } from "vitest";
import {
  McpServerConfig,
  McpServerTransport,
  McpServerTransportHttp,
  McpServerTransportStdio,
} from "../mcp";

describe("MCP configuration types", () => {
  describe("McpServerTransportStdio", () => {
    it("should parse valid stdio transport config", () => {
      const config = McpServerTransportStdio.parse({
        command: "node",
        args: ["server.js"],
      });
      expect(config.command).toBe("node");
      expect(config.args).toEqual(["server.js"]);
    });

    it("should parse stdio transport with optional fields", () => {
      const config = McpServerTransportStdio.parse({
        command: "python",
        args: ["-m", "server"],
        cwd: "/path/to/server",
        env: { KEY: "value" },
      });
      expect(config.cwd).toBe("/path/to/server");
      expect(config.env).toEqual({ KEY: "value" });
    });

    it("should fail without required command field", () => {
      expect(() =>
        McpServerTransportStdio.parse({
          args: ["server.js"],
        }),
      ).toThrow();
    });

    it("should fail without required args field", () => {
      expect(() =>
        McpServerTransportStdio.parse({
          command: "node",
        }),
      ).toThrow();
    });
  });

  describe("McpServerTransportHttp", () => {
    it("should parse valid http transport config", () => {
      const config = McpServerTransportHttp.parse({
        url: "http://localhost:3000",
      });
      expect(config.url).toBe("http://localhost:3000");
    });

    it("should parse http transport with headers", () => {
      const config = McpServerTransportHttp.parse({
        url: "https://api.example.com",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "application/json",
        },
      });
      expect(config.headers).toEqual({
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      });
    });

    it("should fail without required url field", () => {
      expect(() => McpServerTransportHttp.parse({})).toThrow();
    });
  });

  describe("McpServerTransport", () => {
    it("should parse stdio transport", () => {
      const config = McpServerTransport.parse({
        command: "node",
        args: ["server.js"],
      });
      expect(config).toHaveProperty("command");
      expect(config).toHaveProperty("args");
    });

    it("should parse http transport", () => {
      const config = McpServerTransport.parse({
        url: "http://localhost:3000",
      });
      expect(config).toHaveProperty("url");
    });
  });

  describe("McpServerConfig", () => {
    it("should parse config with stdio transport and customization", () => {
      const config = McpServerConfig.parse({
        command: "node",
        args: ["server.js"],
        disabled: false,
        disabledTools: ["tool1", "tool2"],
      });
      if ("command" in config) {
        expect(config.command).toBe("node");
      }
      expect(config.disabled).toBe(false);
      expect(config.disabledTools).toEqual(["tool1", "tool2"]);
    });

    it("should parse config with http transport and customization", () => {
      const config = McpServerConfig.parse({
        url: "http://localhost:3000",
        disabled: true,
        disabledTools: ["dangerousTool"],
      });
      if ("url" in config) {
        expect(config.url).toBe("http://localhost:3000");
      }
      expect(config.disabled).toBe(true);
      expect(config.disabledTools).toEqual(["dangerousTool"]);
    });

    it("should parse config without optional customization fields", () => {
      const config = McpServerConfig.parse({
        command: "python",
        args: ["-m", "server"],
      });
      if ("command" in config) {
        expect(config.command).toBe("python");
      }
      expect(config.disabled).toBeUndefined();
      expect(config.disabledTools).toBeUndefined();
    });

    it("should fail with invalid config", () => {
      expect(() => McpServerConfig.parse({})).toThrow();
    });
  });
});
