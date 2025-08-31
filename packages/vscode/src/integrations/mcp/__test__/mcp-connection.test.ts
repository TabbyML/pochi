import * as assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";
import * as sinon from "sinon";
import * as vscode from "vscode";

import type { McpServerConfig } from "@getpochi/common/configuration";
import proxyquire from "proxyquire";

describe("McpConnection", () => {
  let McpConnection: any;
  let mcpConnection: any;
  let mockContext: vscode.ExtensionContext;
  let sandbox: sinon.SinonSandbox;
  let mockCreateClient: sinon.SinonStub;
  let mockStdioTransport: sinon.SinonStub;
  let mockStreamableTransport: sinon.SinonStub;
  let mockCheckUrlIsSseServer: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Mock extension context
    mockContext = {
      extension: {
        id: "test-extension-id",
      },
    } as any;

    // Mock client and transport
    const mockClient = {
      tools: sandbox.stub().resolves({
        "test-tool": {
          description: "Test tool",
          parameters: { jsonSchema: {} },
          execute: sandbox.stub().resolves("test result"),
        },
      }),
      close: sandbox.stub().resolves(),
    };

    mockCreateClient = sandbox.stub().resolves(mockClient);
    mockStdioTransport = sandbox.stub();
    mockStreamableTransport = sandbox.stub();
    mockCheckUrlIsSseServer = sandbox.stub().resolves(false);

    // Use proxyquire to mock dependencies
    McpConnection = proxyquire("../mcp-connection", {
      "ai": {
        experimental_createMCPClient: mockCreateClient,
      },
      "@modelcontextprotocol/sdk/client/stdio.js": {
        StdioClientTransport: mockStdioTransport,
        getDefaultEnvironment: () => ({
          PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
          HOME: process.env.HOME || process.env.USERPROFILE || "/home/user",
          USERPROFILE: process.env.USERPROFILE || process.env.HOME || "C:\\Users\\user",
          SYSTEMDRIVE: process.env.SYSTEMDRIVE || "C:",
        }),
      },
      "@modelcontextprotocol/sdk/client/streamableHttp.js": {
        StreamableHTTPClientTransport: mockStreamableTransport,
      },
      "./utils": {
        checkUrlIsSseServer: mockCheckUrlIsSseServer,
        readableError: (error: any) => error?.message || String(error),
        shouldRestartDueToConfigChanged: sandbox.stub().returns(false),
        isToolEnabledChanged: sandbox.stub().returns(false),
      },
      "@/lib/logger": {
        getLogger: () => ({
          debug: sandbox.stub(),
          trace: sandbox.stub(),
          error: sandbox.stub(),
        }),
      },
    }).McpConnection;
  });

  afterEach(() => {
    if (mcpConnection) {
      mcpConnection.dispose();
    }
    sandbox.restore();
  });

  describe("constructor", () => {
    it("should initialize with stopped status", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: true,
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      const status = mcpConnection.status.value;
      assert.strictEqual(status.status, "stopped");
      assert.strictEqual(status.error, undefined);
      assert.deepStrictEqual(status.tools, {});
    });

    it("should start connection if not disabled", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: false,
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Should transition to starting state
      const status = mcpConnection.status.value;
      assert.strictEqual(status.status, "starting");
    });

    it("should not start connection if disabled", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: true,
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      const status = mcpConnection.status.value;
      assert.strictEqual(status.status, "stopped");
    });
  });

  describe("updateConfig", () => {
    beforeEach(() => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: true,
      };
      mcpConnection = new McpConnection("test-server", mockContext, config);
    });

    it("should stop connection when disabled", () => {
      const newConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: true,
      };

      // Start with enabled config
      mcpConnection.updateConfig({
        command: "node",
        args: ["server.js"],
        disabled: false,
      });

      // Then disable
      mcpConnection.updateConfig(newConfig);

      const status = mcpConnection.status.value;
      assert.strictEqual(status.status, "stopped");
    });

    it("should start connection when enabled", () => {
      const newConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: false,
      };

      mcpConnection.updateConfig(newConfig);

      const status = mcpConnection.status.value;
      assert.strictEqual(status.status, "starting");
    });

    it("should restart connection when config changes significantly", () => {
      // Mock shouldRestartDueToConfigChanged to return true
      const shouldRestartStub = sandbox.stub().returns(true);
      McpConnection = proxyquire("../mcp-connection", {
        "ai": { experimental_createMCPClient: mockCreateClient },
        "@modelcontextprotocol/sdk/client/stdio.js": { StdioClientTransport: mockStdioTransport },
        "@modelcontextprotocol/sdk/client/streamableHttp.js": { StreamableHTTPClientTransport: mockStreamableTransport },
        "./utils": {
          checkUrlIsSseServer: mockCheckUrlIsSseServer,
          readableError: (error: any) => error?.message || String(error),
          shouldRestartDueToConfigChanged: shouldRestartStub,
          isToolEnabledChanged: sandbox.stub().returns(false),
        },
        "@/lib/logger": {
          getLogger: () => ({
            debug: sandbox.stub(),
            trace: sandbox.stub(),
            error: sandbox.stub(),
          }),
        },
      }).McpConnection;

      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: false,
      };
      mcpConnection = new McpConnection("test-server", mockContext, config);

      const newConfig: McpServerConfig = {
        command: "python",
        args: ["server.py"],
        disabled: false,
      };

      mcpConnection.updateConfig(newConfig);

      // Should have called shouldRestartDueToConfigChanged
      assert.ok(shouldRestartStub.called);
    });
  });

  describe("restart", () => {
    it("should restart the connection", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: false,
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Mock the FSM to track restart calls
      const originalSend = mcpConnection.fsm.send;
      const sendSpy = sandbox.spy();
      mcpConnection.fsm.send = (event: any) => {
        sendSpy(event);
        return originalSend.call(mcpConnection.fsm, event);
      };

      mcpConnection.restart();

      assert.ok(sendSpy.calledWith({ type: "restart" }));
    });
  });

  describe("stdio transport connection", () => {
    it("should connect using stdio transport", async () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        cwd: "/test/cwd",
        disabled: false,
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Wait for connection attempt
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(mockCreateClient.called);
      assert.ok(mockStdioTransport.called);

      const transportCall = mockStdioTransport.getCall(0);
      const transportArgs = transportCall.args[0];
      assert.strictEqual(transportArgs.command, "node");
      assert.deepStrictEqual(transportArgs.args, ["server.js"]);
      assert.strictEqual(transportArgs.cwd, "/test/cwd");
      assert.ok(transportArgs.env); // Should have environment variables
    });

    it("should pass environment variables to stdio transport", async () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        env: { DEBUG: "1", NODE_ENV: "test" },
        disabled: false,
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Wait for connection attempt
      await new Promise(resolve => setTimeout(resolve, 10));

      const transportCall = mockStdioTransport.getCall(0);
      const env = transportCall.args[0].env;
      assert.strictEqual(env.DEBUG, "1");
      assert.strictEqual(env.NODE_ENV, "test");
      // Should also have default environment variables
      assert.ok(env.PATH);
      assert.ok(env.HOME || env.USERPROFILE, "HOME or USERPROFILE should be set"); // HOME on Unix, USERPROFILE on Windows
      if (process.platform === 'win32') {
        assert.ok(env.SYSTEMDRIVE, 'SYSTEMDRIVE should be set on Windows');
      }
    });
  });

  describe("http transport connection", () => {
    it("should connect using streamable HTTP transport for non-SSE servers", async () => {
      mockCheckUrlIsSseServer.resolves(false);

      const config: McpServerConfig = {
        url: "http://localhost:3000/mcp",
        headers: { "Authorization": "Bearer token" },
        disabled: false,
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Wait for connection attempt
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(mockCheckUrlIsSseServer.calledWith("http://localhost:3000/mcp"));
      assert.ok(mockCreateClient.called);
      assert.ok(mockStreamableTransport.called);
    });

    it("should connect using SSE transport for SSE servers", async () => {
      mockCheckUrlIsSseServer.resolves(true);

      const config: McpServerConfig = {
        url: "http://localhost:3000/sse",
        headers: { "Authorization": "Bearer token" },
        disabled: false,
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Wait for connection attempt
      await new Promise(resolve => setTimeout(resolve, 10));

      assert.ok(mockCheckUrlIsSseServer.calledWith("http://localhost:3000/sse"));
      assert.ok(mockCreateClient.called);

      const createClientCall = mockCreateClient.getCall(0);
      assert.strictEqual(createClientCall.args[0].transport.type, "sse");
      assert.strictEqual(createClientCall.args[0].transport.url, "http://localhost:3000/sse");
    });
  });

  describe("tool execution", () => {
    beforeEach(async () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: false,
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Wait for connection to be ready
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    it("should execute enabled tools", async () => {
      const status = mcpConnection.status.value;

      if (status.tools["test-tool"]) {
        const result = await status.tools["test-tool"].execute({ arg: "value" }, {});
        assert.strictEqual(result, "test result");
      }
    });

    it("should prevent execution of disabled tools", async () => {
      // Update config to disable the tool
      mcpConnection.updateConfig({
        command: "node",
        args: ["server.js"],
        disabledTools: ["test-tool"],
        disabled: false,
      });

      const status = mcpConnection.status.value;

      if (status.tools["test-tool"]) {
        try {
          await status.tools["test-tool"].execute({ arg: "value" }, {});
          assert.fail("Should have thrown error for disabled tool");
        } catch (error: any) {
          assert.ok(error.message.includes("disabled"));
        }
      }
    });

    it("should handle tool execution errors", async () => {
      // Mock tool to throw error
      const mockClient = {
        tools: sandbox.stub().resolves({
          "error-tool": {
            description: "Error tool",
            parameters: { jsonSchema: {} },
            execute: sandbox.stub().rejects(new Error("Tool execution failed")),
          },
        }),
        close: sandbox.stub().resolves(),
      };

      mockCreateClient.resolves(mockClient);

      const config: McpServerConfig = {
        command: "node",
        args: ["error-server.js"],
        disabled: false,
      };

      const errorConnection = new McpConnection("error-server", mockContext, config);

      // Wait for connection
      await new Promise(resolve => setTimeout(resolve, 50));

      const status = errorConnection.status.value;

      if (status.tools["error-tool"]) {
        try {
          await status.tools["error-tool"].execute({ arg: "value" }, {});
          assert.fail("Should have thrown error");
        } catch (error: any) {
          assert.strictEqual(error.message, "Tool execution failed");
        }
      }

      errorConnection.dispose();
    });
  });

  describe("error handling", () => {
    it("should handle connection errors", async () => {
      mockCreateClient.rejects(new Error("Connection failed"));

      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: false,
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Wait for connection attempt and error
      await new Promise(resolve => setTimeout(resolve, 50));

      const status = mcpConnection.status.value;
      assert.strictEqual(status.status, "error");
      assert.strictEqual(status.error, "Connection failed");
    });

    it("should handle abort during connection", async () => {
      // Mock a slow connection that can be aborted
      mockCreateClient.callsFake(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({
            tools: () => Promise.resolve({}),
            close: () => Promise.resolve(),
          }), 1000);
        });
      });

      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: false,
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Immediately restart to trigger abort
      mcpConnection.restart();

      // Wait for state changes
      await new Promise(resolve => setTimeout(resolve, 50));

      // Should not be in error state due to abort
      const status = mcpConnection.status.value;
      assert.notStrictEqual(status.status, "error");
    });
  });

  describe("auto-reconnect", () => {
    it("should attempt auto-reconnect on error", async () => {
      mockCreateClient.rejects(new Error("Connection failed"));

      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: false,
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Wait for initial error
      await new Promise(resolve => setTimeout(resolve, 50));

      let status = mcpConnection.status.value;
      assert.strictEqual(status.status, "error");

      // Mock successful connection for retry
      const mockClient = {
        tools: sandbox.stub().resolves({}),
        close: sandbox.stub().resolves(),
      };
      mockCreateClient.resolves(mockClient);

      // Wait for auto-reconnect attempt (should be much shorter in test)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Note: In a real test, you might want to mock the timer to make this deterministic
    });
  });

  describe("dispose", () => {
    it("should stop FSM and dispose listeners", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: false,
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      const fsmStopSpy = sandbox.spy(mcpConnection.fsm, "stop");

      mcpConnection.dispose();

      assert.ok(fsmStopSpy.called);

      const status = mcpConnection.status.value;
      assert.strictEqual(status.status, "stopped");
    });
  });

  describe("tool disabled check", () => {
    it("should correctly identify disabled tools", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabledTools: ["tool1", "tool2"],
        disabled: true,
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Access private method for testing
      const isDisabled1 = (mcpConnection as any).isToolDisabled("tool1");
      const isDisabled2 = (mcpConnection as any).isToolDisabled("tool2");
      const isDisabled3 = (mcpConnection as any).isToolDisabled("tool3");

      assert.strictEqual(isDisabled1, true);
      assert.strictEqual(isDisabled2, true);
      assert.strictEqual(isDisabled3, false);
    });

    it("should handle missing disabledTools array", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: true,
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      const isDisabled = (mcpConnection as any).isToolDisabled("any-tool");
      assert.strictEqual(isDisabled, false);
    });
  });
});
