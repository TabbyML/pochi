import { describe, it, expect } from "vitest";
import {
  isStdioTransport,
  isHttpTransport,
} from "../types";
import type { McpServerConfig } from "../../configuration";

describe("MCP Types", () => {
  describe("isStdioTransport", () => {
    it("should return true for stdio transport config", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
      };

      const result = isStdioTransport(config);
      expect(result).toBe(true);
    });

    it("should return false for http transport config", () => {
      const config: McpServerConfig = {
        url: "http://localhost:3000",
      };

      const result = isStdioTransport(config);
      expect(result).toBe(false);
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
      expect(result).toBe(true);
    });
  });

  describe("isHttpTransport", () => {
    it("should return true for http transport config", () => {
      const config: McpServerConfig = {
        url: "http://localhost:3000",
      };

      const result = isHttpTransport(config);
      expect(result).toBe(true);
    });

    it("should return false for stdio transport config", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
      };

      const result = isHttpTransport(config);
      expect(result).toBe(false);
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
      expect(result).toBe(true);
    });

    it("should return false for config with both command and url", () => {
      // This shouldn't happen in practice, but test the type guard behavior
      const config = {
        command: "node",
        args: ["server.js"],
        url: "http://localhost:3000",
      } as any;

      const result = isHttpTransport(config);
      expect(result).toBe(false);
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
      expect(config).toBeTruthy();
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
      expect(config).toBeTruthy();
    });

    it("should accept minimal stdio config", () => {
      const config: McpServerConfig = {
        command: "echo",
        args: ["hello"],
      };

      // If this compiles, the type is correct
      expect(config).toBeTruthy();
    });

    it("should accept minimal http config", () => {
      const config: McpServerConfig = {
        url: "http://localhost:8080",
      };

      // If this compiles, the type is correct
      expect(config).toBeTruthy();
    });
  });
});