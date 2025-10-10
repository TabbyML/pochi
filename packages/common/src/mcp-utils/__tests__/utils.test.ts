import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { readableError, shouldRestartDueToConfigChanged, checkUrlIsSseServer } from "../utils";
import type { McpServerConfig } from "../../configuration/index.js";

// Mock HTTP modules
vi.mock("node:http", () => ({
  request: vi.fn(),
}));

vi.mock("node:https", () => ({
  request: vi.fn(),
}));

describe("MCP Utils", () => {
  describe("readableError", () => {
    test("should return message from error object", () => {
      const error = new Error("Test error message");
      expect(readableError(error)).toBe("Test error message");
    });

    test("should return JSON string for non-error objects", () => {
      const error = { code: 500, status: "Internal Server Error" };
      expect(readableError(error)).toBe(JSON.stringify(error));
    });

    test("should handle null and undefined", () => {
      expect(readableError(null)).toBe("null");
      expect(readableError(undefined)).toBe(undefined);
    });

    test("should handle primitive values", () => {
      expect(readableError("string error")).toBe('"string error"');
      expect(readableError(42)).toBe("42");
      expect(readableError(true)).toBe("true");
    });
  });

  describe("shouldRestartDueToConfigChanged", () => {
    test("should return true when transport type changes from stdio to http", () => {
      const oldConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
      };
      const newConfig: McpServerConfig = {
        url: "http://localhost:3000",
      };
      expect(shouldRestartDueToConfigChanged(oldConfig, newConfig)).toBe(true);
    });

    test("should return true when transport type changes from http to stdio", () => {
      const oldConfig: McpServerConfig = {
        url: "http://localhost:3000",
      };
      const newConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
      };
      expect(shouldRestartDueToConfigChanged(oldConfig, newConfig)).toBe(true);
    });

    test("should return true when stdio config changes", () => {
      const oldConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
      };
      const newConfig: McpServerConfig = {
        command: "node",
        args: ["different-server.js"],
      };
      expect(shouldRestartDueToConfigChanged(oldConfig, newConfig)).toBe(true);
    });

    test("should return true when http config changes", () => {
      const oldConfig: McpServerConfig = {
        url: "http://localhost:3000",
      };
      const newConfig: McpServerConfig = {
        url: "http://localhost:4000",
      };
      expect(shouldRestartDueToConfigChanged(oldConfig, newConfig)).toBe(true);
    });

    test("should return false when stdio config remains the same", () => {
      const oldConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        env: { NODE_ENV: "development" },
      };
      const newConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        env: { NODE_ENV: "development" },
      };
      expect(shouldRestartDueToConfigChanged(oldConfig, newConfig)).toBe(false);
    });

    test("should return false when http config remains the same", () => {
      const oldConfig: McpServerConfig = {
        url: "http://localhost:3000",
        headers: { "Authorization": "Bearer token" },
      };
      const newConfig: McpServerConfig = {
        url: "http://localhost:3000",
        headers: { "Authorization": "Bearer token" },
      };
      expect(shouldRestartDueToConfigChanged(oldConfig, newConfig)).toBe(false);
    });
  });

  describe("checkUrlIsSseServer", () => {
    beforeEach(async () => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test("should return true when URL path contains 'sse'", async () => {
      const result = await checkUrlIsSseServer("http://localhost:3000/api/sse");
      expect(result).toBe(true);
    });

    test("should return true when URL path contains 'sse' in subdirectory", async () => {
      const result = await checkUrlIsSseServer("http://localhost:3000/api/sse/events");
      expect(result).toBe(true);
    });

    test("should return false for invalid URLs", async () => {
      const result = await checkUrlIsSseServer("invalid-url");
      expect(result).toBe(false);
    });

    test("should handle URLs with query parameters containing 'sse'", async () => {
      const result = await checkUrlIsSseServer("http://localhost:3000/api/sse?token=abc123");
      expect(result).toBe(true);
    });

    test("should handle HTTPS URLs with 'sse' in path", async () => {
      const result = await checkUrlIsSseServer("https://example.com/sse");
      expect(result).toBe(true);
    });

    test("should return true when server responds with text/event-stream content-type", async () => {
      const http = await import("node:http");
      const mockHttpRequest = vi.mocked(http.request);
      
      const mockResponse = {
        headers: {
          "content-type": "text/event-stream",
        },
        destroy: vi.fn(),
      };

      const mockRequest = {
        on: vi.fn(),
        setTimeout: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      mockHttpRequest.mockImplementation((_options: any, callback: any) => {
        // Simulate successful response
        setTimeout(() => callback(mockResponse), 0);
        return mockRequest as any;
      });

      const result = await checkUrlIsSseServer("http://localhost:3000/api/mcp");
      expect(result).toBe(true);
    });

    test("should return false when server responds with different content-type", async () => {
      const http = await import("node:http");
      const mockHttpRequest = vi.mocked(http.request);
      
      const mockResponse = {
        headers: {
          "content-type": "application/json",
        },
        destroy: vi.fn(),
      };

      const mockRequest = {
        on: vi.fn(),
        setTimeout: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      mockHttpRequest.mockImplementation((_options: any, callback: any) => {
        setTimeout(() => callback(mockResponse), 0);
        return mockRequest as any;
      });

      const result = await checkUrlIsSseServer("http://localhost:3000/api/mcp");
      expect(result).toBe(false);
    });

    test("should use https for https URLs", async () => {
      const https = await import("node:https");
      const http = await import("node:http");
      const mockHttpsRequest = vi.mocked(https.request);
      const mockHttpRequest = vi.mocked(http.request);
      
      const mockResponse = {
        headers: {
          "content-type": "text/event-stream",
        },
        destroy: vi.fn(),
      };

      const mockRequest = {
        on: vi.fn(),
        setTimeout: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      mockHttpsRequest.mockImplementation((_options: any, callback: any) => {
        setTimeout(() => callback(mockResponse), 0);
        return mockRequest as any;
      });

      const result = await checkUrlIsSseServer("https://example.com/api/mcp");
      expect(result).toBe(true);
      expect(mockHttpsRequest).toHaveBeenCalled();
      expect(mockHttpRequest).not.toHaveBeenCalled();
    });

    test("should handle request errors", async () => {
      const http = await import("node:http");
      const mockHttpRequest = vi.mocked(http.request);
      
      const mockRequest = {
        on: vi.fn(),
        setTimeout: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      mockHttpRequest.mockImplementation(() => {
        const request = mockRequest;
        // Simulate error
        setTimeout(() => {
          const errorCallback = request.on.mock.calls.find(call => call[0] === 'error')?.[1];
          if (errorCallback) errorCallback(new Error("Connection failed"));
        }, 0);
        return request as any;
      });

      const result = await checkUrlIsSseServer("http://localhost:3000/api/mcp");
      expect(result).toBe(false);
    });

    test("should handle request timeout", async () => {
      const http = await import("node:http");
      const mockHttpRequest = vi.mocked(http.request);
      
      const mockRequest = {
        on: vi.fn(),
        setTimeout: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      mockHttpRequest.mockImplementation(() => {
        const request = mockRequest;
        // Simulate timeout
        setTimeout(() => {
          const timeoutCallback = request.on.mock.calls.find(call => call[0] === 'timeout')?.[1];
          if (timeoutCallback) timeoutCallback();
        }, 0);
        return request as any;
      });

      const result = await checkUrlIsSseServer("http://localhost:3000/api/mcp");
      expect(result).toBe(false);
    });

    test("should set correct request options", async () => {
      const http = await import("node:http");
      const mockHttpRequest = vi.mocked(http.request);
      
      const mockResponse = {
        headers: {
          "content-type": "application/json",
        },
        destroy: vi.fn(),
      };

      const mockRequest = {
        on: vi.fn(),
        setTimeout: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      mockHttpRequest.mockImplementation((options: any, callback: any) => {
        // Verify request options
        expect(options.hostname).toBe("localhost");
        expect(options.port).toBe("3000");
        expect(options.path).toBe("/api/mcp?param=value");
        expect(options.method).toBe("GET");
        expect(options.headers).toEqual({
          Accept: "text/event-stream, */*",
        });

        setTimeout(() => callback(mockResponse), 0);
        return mockRequest as any;
      });

      await checkUrlIsSseServer("http://localhost:3000/api/mcp?param=value");
      expect(mockHttpRequest).toHaveBeenCalled();
    });

    test("should handle default ports correctly", async () => {
      const http = await import("node:http");
      const https = await import("node:https");
      const mockHttpRequest = vi.mocked(http.request);
      const mockHttpsRequest = vi.mocked(https.request);
      
      const mockResponse = {
        headers: { "content-type": "application/json" },
        destroy: vi.fn(),
      };

      const mockRequest = {
        on: vi.fn(),
        setTimeout: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      // Test HTTP default port (80)
      mockHttpRequest.mockImplementation((options: any, callback: any) => {
        expect(options.port).toBe(80);
        setTimeout(() => callback(mockResponse), 0);
        return mockRequest as any;
      });

      await checkUrlIsSseServer("http://example.com/api/mcp");

      // Test HTTPS default port (443)
      mockHttpsRequest.mockImplementation((options: any, callback: any) => {
        expect(options.port).toBe(443);
        setTimeout(() => callback(mockResponse), 0);
        return mockRequest as any;
      });

      await checkUrlIsSseServer("https://example.com/api/mcp");
    });

    test("should handle case-insensitive content-type check", async () => {
      const http = await import("node:http");
      const mockHttpRequest = vi.mocked(http.request);
      
      const mockResponse = {
        headers: {
          "content-type": "TEXT/EVENT-STREAM; charset=utf-8",
        },
        destroy: vi.fn(),
      };

      const mockRequest = {
        on: vi.fn(),
        setTimeout: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      mockHttpRequest.mockImplementation((_options: any, callback: any) => {
        setTimeout(() => callback(mockResponse), 0);
        return mockRequest as any;
      });

      const result = await checkUrlIsSseServer("http://localhost:3000/api/mcp");
      expect(result).toBe(true);
    });

    test("should handle case variations in URL path", async () => {
      const http = await import("node:http");
      const mockHttpRequest = vi.mocked(http.request);
      
      const mockResponse = {
        headers: {
          "content-type": "application/json",
        },
        destroy: vi.fn(),
      };

      const mockRequest = {
        on: vi.fn(),
        setTimeout: vi.fn(),
        end: vi.fn(),
        destroy: vi.fn(),
      };

      mockHttpRequest.mockImplementation((_options: any, callback: any) => {
        setTimeout(() => callback(mockResponse), 0);
        return mockRequest as any;
      });
      
      const result1 = await checkUrlIsSseServer("http://localhost:3000/api/SSE");
      const result2 = await checkUrlIsSseServer("http://localhost:3000/api/Sse");
      // Current implementation is case-sensitive for path detection
      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });

    test("should handle URLs with fragments", async () => {
      const result = await checkUrlIsSseServer("http://localhost:3000/api/sse#section");
      expect(result).toBe(true);
    });

    test("should handle URLs with multiple path segments containing 'sse'", async () => {
      const result = await checkUrlIsSseServer("http://localhost:3000/sse/api/sse/events");
      expect(result).toBe(true);
    });
  });
});