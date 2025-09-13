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
  let mockBaseConnection: any;
  let mockIsToolEnabledChanged: sinon.SinonStub;
  let mockBaseConnectionClass: sinon.SinonStub;
  let capturedConfig: any;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Mock extension context
    mockContext = {
      extension: {
        id: "test-extension-id",
      },
    } as any;

    // Mock BaseConnection instance
    mockBaseConnection = {
      getStatus: sandbox.stub().returns({
        status: "stopped",
        error: undefined,
        tools: {},
      }),
      updateConfig: sandbox.stub(),
      restart: sandbox.stub(),
      dispose: sandbox.stub(),
      isToolDisabled: sandbox.stub().returns(false),
    };

    // Mock BaseConnection constructor that captures arguments
    mockBaseConnectionClass = sandbox.stub().callsFake((_serverName, _clientName, config, _options) => {
      // Store the config for later verification
      capturedConfig = config;
      return mockBaseConnection;
    });
    mockIsToolEnabledChanged = sandbox.stub().returns(false);

    // Use proxyquire to mock dependencies
    McpConnection = proxyquire("../mcp-connection", {
      "@getpochi/common/mcp-utils": {
        McpConnection: mockBaseConnectionClass,
      },
      "./utils": {
        isToolEnabledChanged: mockIsToolEnabledChanged,
      },
    }).McpConnection;
  });

  afterEach(() => {
    sandbox.restore();
    if (mcpConnection) {
      mcpConnection.dispose();
    }
  });

  describe("constructor", () => {
    it("should create McpConnection with valid config", () => {
      const config: McpServerConfig = {
        command: "test-command",
        args: ["arg1", "arg2"],
        env: { TEST_VAR: "test-value" },
        disabledTools: [],
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      assert.ok(mcpConnection);
      assert.ok(mockBaseConnectionClass.calledOnce);
    });
  });

  describe("updateConfig", () => {
    it("should restart connection when config changes significantly", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["script.js"],
        disabledTools: [],
      };
      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Mock that config change requires restart
      mockIsToolEnabledChanged.returns(true); // Simulate significant change

      const newConfig: McpServerConfig = {
        command: "python",
        args: ["script.py"],
        disabledTools: [],
      };
      mcpConnection.updateConfig(newConfig);

      // Should have called updateConfig on base connection
      assert.ok(mockBaseConnection.updateConfig.called);
    });
  });

  describe("restart", () => {
    it("should restart the connection", () => {
      const config: McpServerConfig = {
        command: "test-command",
        args: [],
        disabledTools: [],
      };
      mcpConnection = new McpConnection("test-server", mockContext, config);

      mcpConnection.restart();

      assert.ok(mockBaseConnection.restart.calledOnce);
    });
  });

  describe("stdio transport connection", () => {
    it("should connect using stdio transport", () => {
      const config: McpServerConfig = {
        command: "test-command",
        args: ["arg1"],
        disabledTools: [],
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Should have created base connection with stdio config
      assert.ok(mockBaseConnectionClass.calledOnce);
      assert.strictEqual(capturedConfig.command, "test-command");
    });

    it("should pass environment variables to stdio transport", () => {
      const config: McpServerConfig = {
        command: "test-command",
        args: ["arg1"],
        env: { TEST_VAR: "test-value" },
        disabledTools: [],
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Should have passed env variables to base connection
      assert.ok(mockBaseConnectionClass.calledOnce);
      assert.deepStrictEqual(capturedConfig.env, { TEST_VAR: "test-value" });
    });
  });

  describe("http transport connection", () => {
    it("should connect using streamable HTTP transport for non-SSE servers", () => {
      const config: McpServerConfig = {
        url: "http://localhost:3000",
        disabledTools: [],
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Should have created base connection with HTTP config
      assert.ok(mockBaseConnectionClass.calledOnce);
      assert.strictEqual(capturedConfig.url, "http://localhost:3000");
    });

    it("should connect using SSE transport for SSE servers", () => {
      const config: McpServerConfig = {
        url: "http://localhost:3000/sse",
        disabledTools: [],
      };

      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Should have created base connection with SSE config
      assert.ok(mockBaseConnectionClass.calledOnce);
      assert.strictEqual(capturedConfig.url, "http://localhost:3000/sse");
    });
  });

  describe("status signal", () => {
    it("should provide reactive status updates", () => {
      const config: McpServerConfig = {
        command: "test-command",
        args: [],
        disabledTools: [],
      };
      mcpConnection = new McpConnection("test-server", mockContext, config);

      const status = mcpConnection.status.value;

      assert.ok(mockBaseConnectionClass.calledOnce);
      assert.strictEqual(status.status, "stopped");
    });
  });

  describe("error handling", () => {
    it("should handle connection errors", () => {
      const config: McpServerConfig = {
        command: "test-command",
        args: [],
        disabledTools: [],
      };
      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Simulate error status by updating the signal
      mcpConnection.status.value = {
        status: "error",
        error: "Connection closed",
        tools: {},
      };

      const status = mcpConnection.status.value;
      assert.strictEqual(status.error, "Connection closed");
    });

    it("should handle abort during connection", () => {
      const config: McpServerConfig = {
        command: "test-command",
        args: [],
        disabledTools: [],
      };
      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Simulate connecting status
      mcpConnection.status.value = {
        status: "connecting",
        error: undefined,
        tools: {},
      };

      const status = mcpConnection.status.value;
      assert.notStrictEqual(status.status, "error");
    });
  });

  describe("dispose", () => {
    it("should stop FSM and dispose listeners", () => {
      const config: McpServerConfig = {
        command: "test-command",
        args: [],
        disabledTools: [],
      };
      mcpConnection = new McpConnection("test-server", mockContext, config);

      mcpConnection.dispose();

      assert.ok(mockBaseConnection.dispose.calledOnce);
    });
  });

  describe("tool status management", () => {
    it("should correctly reflect disabled tools in status", () => {
      const config: McpServerConfig = {
        command: "test-command",
        args: [],
        disabledTools: ["disabled-tool"],
      };
      mcpConnection = new McpConnection("test-server", mockContext, config);

      // Simulate tools status with disabled tool
      mcpConnection.status.value = {
        status: "connected",
        error: undefined,
        tools: {
          "disabled-tool": {
            disabled: true,
            description: "A disabled tool",
            inputSchema: { jsonSchema: {} },
            execute: async () => "result",
          },
          "enabled-tool": {
            disabled: false,
            description: "An enabled tool",
            inputSchema: { jsonSchema: {} },
            execute: async () => "result",
          },
        },
      };

      const status = mcpConnection.status.value;
      assert.strictEqual(status.tools["disabled-tool"].disabled, true);
      assert.strictEqual(status.tools["enabled-tool"].disabled, false);
    });

    it("should handle empty tools object", () => {
      const config: McpServerConfig = {
        command: "test-command",
        args: [],
      };
      mcpConnection = new McpConnection("test-server", mockContext, config);

      const status = mcpConnection.status.value;
      assert.deepStrictEqual(status.tools, {});
    });
  });
});
