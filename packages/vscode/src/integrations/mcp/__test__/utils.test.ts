import * as assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";
import * as sinon from "sinon";
import type { McpServerConfig } from "@getpochi/common/configuration";
import proxyquire from "proxyquire";

describe("MCP Utils", () => {
  let sandbox: sinon.SinonSandbox;
  let utils: any;
  let mockHttp: any;
  let mockHttps: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Create mock HTTP modules
    mockHttp = {
      request: sandbox.stub(),
    };

    mockHttps = {
      request: sandbox.stub(),
    };

    // Use proxyquire to mock the HTTP modules
    utils = proxyquire("../utils", {
      "node:http": mockHttp,
      "node:https": mockHttps,
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("readableError", () => {
    it("should return message from error object", () => {
      const error = new Error("Test error message");
      const result = utils.readableError(error);
      assert.strictEqual(result, "Test error message");
    });

    it("should return message from object with message property", () => {
      const error = { message: "Custom error message" };
      const result = utils.readableError(error);
      assert.strictEqual(result, "Custom error message");
    });

    it("should return string representation for objects without message", () => {
      const error = { code: 500, details: "Server error" };
      const result = utils.readableError(error);
      assert.strictEqual(result, '{"code":500,"details":"Server error"}');
    });

    it("should return string representation for primitive values", () => {
      assert.strictEqual(utils.readableError("string error"), '"string error"');
      assert.strictEqual(utils.readableError(404), "404");
      assert.strictEqual(utils.readableError(true), "true");
      assert.strictEqual(utils.readableError(null), "null");
    });

    it("should handle undefined", () => {
      const result = utils.readableError(undefined);
      assert.strictEqual(result, undefined);
    });
  });

  describe("shouldRestartDueToConfigChanged", () => {
    it("should return true when transport type changes from stdio to http", () => {
      const oldConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
      };
      const newConfig: McpServerConfig = {
        url: "http://localhost:3000",
      };

      const result = utils.shouldRestartDueToConfigChanged(oldConfig, newConfig);
      assert.strictEqual(result, true);
    });

    it("should return true when transport type changes from http to stdio", () => {
      const oldConfig: McpServerConfig = {
        url: "http://localhost:3000",
      };
      const newConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
      };

      const result = utils.shouldRestartDueToConfigChanged(oldConfig, newConfig);
      assert.strictEqual(result, true);
    });

    it("should return true when stdio config changes", () => {
      const oldConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
      };
      const newConfig: McpServerConfig = {
        command: "python",
        args: ["server.py"],
      };

      const result = utils.shouldRestartDueToConfigChanged(oldConfig, newConfig);
      assert.strictEqual(result, true);
    });

    it("should return true when stdio environment changes", () => {
      const oldConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        env: { DEBUG: "1" },
      };
      const newConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        env: { DEBUG: "0" },
      };

      const result = utils.shouldRestartDueToConfigChanged(oldConfig, newConfig);
      assert.strictEqual(result, true);
    });

    it("should return true when http config changes", () => {
      const oldConfig: McpServerConfig = {
        url: "http://localhost:3000",
        headers: { "Authorization": "Bearer token1" },
      };
      const newConfig: McpServerConfig = {
        url: "http://localhost:3001",
        headers: { "Authorization": "Bearer token2" },
      };

      const result = utils.shouldRestartDueToConfigChanged(oldConfig, newConfig);
      assert.strictEqual(result, true);
    });

    it("should return false when only non-transport config changes", () => {
      const oldConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: false,
        disabledTools: ["tool1"],
      };
      const newConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: true,
        disabledTools: ["tool1", "tool2"],
      };

      const result = utils.shouldRestartDueToConfigChanged(oldConfig, newConfig);
      assert.strictEqual(result, false);
    });

    it("should return false when configs are identical", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        env: { DEBUG: "1" },
      };

      const result = utils.shouldRestartDueToConfigChanged(config, { ...config });
      assert.strictEqual(result, false);
    });

    it("should handle missing environment variables", () => {
      const oldConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
      };
      const newConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        env: { DEBUG: "1" },
      };

      const result = utils.shouldRestartDueToConfigChanged(oldConfig, newConfig);
      assert.strictEqual(result, true);
    });

    it("should handle missing headers", () => {
      const oldConfig: McpServerConfig = {
        url: "http://localhost:3000",
      };
      const newConfig: McpServerConfig = {
        url: "http://localhost:3000",
        headers: { "Authorization": "Bearer token" },
      };

      const result = utils.shouldRestartDueToConfigChanged(oldConfig, newConfig);
      assert.strictEqual(result, true);
    });
  });

  describe("isToolEnabledChanged", () => {
    it("should return true when disabled tools list changes", () => {
      const oldConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabledTools: ["tool1"],
      };
      const newConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabledTools: ["tool1", "tool2"],
      };

      const result = utils.isToolEnabledChanged(oldConfig, newConfig);
      assert.strictEqual(result, true);
    });

    it("should return true when disabled tools order changes", () => {
      const oldConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabledTools: ["tool1", "tool2"],
      };
      const newConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabledTools: ["tool2", "tool1"],
      };

      const result = utils.isToolEnabledChanged(oldConfig, newConfig);
      assert.strictEqual(result, true);
    });

    it("should return false when disabled tools are identical", () => {
      const oldConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabledTools: ["tool1", "tool2"],
      };
      const newConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabledTools: ["tool1", "tool2"],
      };

      const result = utils.isToolEnabledChanged(oldConfig, newConfig);
      assert.strictEqual(result, false);
    });

    it("should handle missing disabledTools arrays", () => {
      const oldConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
      };
      const newConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabledTools: ["tool1"],
      };

      const result = utils.isToolEnabledChanged(oldConfig, newConfig);
      assert.strictEqual(result, true);
    });

    it("should return false when both configs have no disabledTools", () => {
      const oldConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
      };
      const newConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
      };

      const result = utils.isToolEnabledChanged(oldConfig, newConfig);
      assert.strictEqual(result, false);
    });

    it("should return true when removing all disabled tools", () => {
      const oldConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabledTools: ["tool1", "tool2"],
      };
      const newConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabledTools: [],
      };

      const result = utils.isToolEnabledChanged(oldConfig, newConfig);
      assert.strictEqual(result, true);
    });
  });

  // functions is currently from common package, so move those test in common
  // describe("checkUrlIsSseServer", () => {

  //   it("should return true for URLs containing 'sse' in path", async () => {
  //     const result = await utils.checkUrlIsSseServer("http://localhost:3000/api/sse");
  //     assert.strictEqual(result, true);
  //   });

  //   it("should return true when server responds with text/event-stream content-type", async () => {
  //     const mockResponse = {
  //       headers: {
  //         "content-type": "text/event-stream",
  //       },
  //       destroy: sandbox.stub(),
  //     };

  //     const mockRequest = {
  //       on: sandbox.stub(),
  //       setTimeout: sandbox.stub(),
  //       end: sandbox.stub(),
  //       destroy: sandbox.stub(),
  //     };

  //     mockHttp.request.callsFake((_options: any, callback: any) => {
  //       // Simulate successful response
  //       setTimeout(() => callback(mockResponse), 0);
  //       return mockRequest;
  //     });

  //     const result = await utils.checkUrlIsSseServer("http://localhost:3000/api/mcp");
  //     assert.strictEqual(result, true);
  //   });

  //   it("should return false when server responds with different content-type", async () => {
  //     const mockResponse = {
  //       headers: {
  //         "content-type": "application/json",
  //       },
  //       destroy: sandbox.stub(),
  //     };

  //     const mockRequest = {
  //       on: sandbox.stub(),
  //       setTimeout: sandbox.stub(),
  //       end: sandbox.stub(),
  //       destroy: sandbox.stub(),
  //     };

  //     mockHttp.request.callsFake((_options: any, callback: any) => {
  //       setTimeout(() => callback(mockResponse), 0);
  //       return mockRequest;
  //     });

  //     const result = await utils.checkUrlIsSseServer("http://localhost:3000/api/mcp");
  //     assert.strictEqual(result, false);
  //   });

  //   it("should use https for https URLs", async () => {
  //     const mockResponse = {
  //       headers: {
  //         "content-type": "text/event-stream",
  //       },
  //       destroy: sandbox.stub(),
  //     };

  //     const mockRequest = {
  //       on: sandbox.stub(),
  //       setTimeout: sandbox.stub(),
  //       end: sandbox.stub(),
  //       destroy: sandbox.stub(),
  //     };

  //     mockHttps.request.callsFake((_options: any, callback: any) => {
  //       setTimeout(() => callback(mockResponse), 0);
  //       return mockRequest;
  //     });

  //     const result = await utils.checkUrlIsSseServer("https://example.com/api/mcp");
  //     assert.strictEqual(result, true);
  //     assert.ok(mockHttps.request.called);
  //     assert.ok(mockHttp.request.notCalled);
  //   });

  //   it("should handle request errors", async () => {
  //     const mockRequest = {
  //       on: sandbox.stub(),
  //       setTimeout: sandbox.stub(),
  //       end: sandbox.stub(),
  //       destroy: sandbox.stub(),
  //     };

  //     mockHttp.request.callsFake(() => {
  //       const request = mockRequest;
  //       // Simulate error
  //       setTimeout(() => {
  //         const errorCallback = request.on.getCall(0).args[1];
  //         errorCallback(new Error("Connection failed"));
  //       }, 0);
  //       return request;
  //     });

  //     const result = await utils.checkUrlIsSseServer("http://localhost:3000/api/mcp");
  //     assert.strictEqual(result, false);
  //   });

  //   it("should handle request timeout", async () => {
  //     const mockRequest = {
  //       on: sandbox.stub(),
  //       setTimeout: sandbox.stub(),
  //       end: sandbox.stub(),
  //       destroy: sandbox.stub(),
  //     };

  //     mockHttp.request.callsFake(() => {
  //       const request = mockRequest;
  //       // Simulate timeout
  //       setTimeout(() => {
  //         const timeoutCallback = request.on.getCall(1).args[1];
  //         timeoutCallback();
  //       }, 0);
  //       return request;
  //     });

  //     const result = await utils.checkUrlIsSseServer("http://localhost:3000/api/mcp");
  //     assert.strictEqual(result, false);
  //   });

  //   it("should handle invalid URLs", async () => {
  //     const result = await utils.checkUrlIsSseServer("invalid-url");
  //     assert.strictEqual(result, false);
  //   });

  //   it("should set correct request options", async () => {
  //     const mockResponse = {
  //       headers: {
  //         "content-type": "application/json",
  //       },
  //       destroy: sandbox.stub(),
  //     };

  //     const mockRequest = {
  //       on: sandbox.stub(),
  //       setTimeout: sandbox.stub(),
  //       end: sandbox.stub(),
  //       destroy: sandbox.stub(),
  //     };

  //     mockHttp.request.callsFake((options: any, callback: any) => {
  //       // Verify request options
  //       assert.strictEqual(options.hostname, "localhost");
  //       assert.strictEqual(options.port, "3000");
  //       assert.strictEqual(options.path, "/api/mcp?param=value");
  //       assert.strictEqual(options.method, "GET");
  //       assert.deepStrictEqual(options.headers, {
  //         Accept: "text/event-stream, */*",
  //       });

  //       setTimeout(() => callback(mockResponse), 0);
  //       return mockRequest;
  //     });

  //     await utils.checkUrlIsSseServer("http://localhost:3000/api/mcp?param=value");
  //     assert.ok(mockHttp.request.called);
  //   });

  //   it("should handle default ports correctly", async () => {
  //     const mockResponse = {
  //       headers: { "content-type": "application/json" },
  //       destroy: sandbox.stub(),
  //     };

  //     const mockRequest = {
  //       on: sandbox.stub(),
  //       setTimeout: sandbox.stub(),
  //       end: sandbox.stub(),
  //       destroy: sandbox.stub(),
  //     };

  //     mockHttp.request.callsFake((options: any, callback: any) => {
  //       assert.strictEqual(options.port, 80);
  //       setTimeout(() => callback(mockResponse), 0);
  //       return mockRequest;
  //     });

  //     await utils.checkUrlIsSseServer("http://example.com/api/mcp");

  //     mockHttps.request.callsFake((options: any, callback: any) => {
  //       assert.strictEqual(options.port, 443);
  //       setTimeout(() => callback(mockResponse), 0);
  //       return mockRequest;
  //     });

  //     await utils.checkUrlIsSseServer("https://example.com/api/mcp");
  //   });

  //   it("should handle case-insensitive content-type check", async () => {
  //     const mockResponse = {
  //       headers: {
  //         "content-type": "TEXT/EVENT-STREAM; charset=utf-8",
  //       },
  //       destroy: sandbox.stub(),
  //     };

  //     const mockRequest = {
  //       on: sandbox.stub(),
  //       setTimeout: sandbox.stub(),
  //       end: sandbox.stub(),
  //       destroy: sandbox.stub(),
  //     };

  //     mockHttp.request.callsFake((_options: any, callback: any) => {
  //       setTimeout(() => callback(mockResponse), 0);
  //       return mockRequest;
  //     });

  //     const result = await utils.checkUrlIsSseServer("http://localhost:3000/api/mcp");
  //     assert.strictEqual(result, true);
  //   });
  // });
});
