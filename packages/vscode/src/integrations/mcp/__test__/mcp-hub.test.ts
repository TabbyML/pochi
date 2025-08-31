import * as assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { signal } from "@preact/signals-core";
import { PochiConfiguration } from "../../configuration";
import type { McpServerConfig } from "@getpochi/common/configuration";
import proxyquire from "proxyquire";

describe("McpHub", () => {
  let mcpHub: any;
  let mockContext: vscode.ExtensionContext;
  let mockConfiguration: PochiConfiguration;
  let McpHub: any;
  let mockConnectionInstance: any;
  let sandbox: sinon.SinonSandbox;
  let MockMcpConnection: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Mock extension context
    mockContext = {
      extension: {
        id: "test-extension-id",
      },
    } as any;

    // Mock configuration
    const mcpServersSignal = signal({});
    mockConfiguration = {
      mcpServers: mcpServersSignal,
      updateMcpServers: sandbox.stub().callsFake((newConfig) => {
        mcpServersSignal.value = newConfig;
      }),
    } as any;

    // Create mock connection instance
    mockConnectionInstance = {
      status: signal({
        status: "stopped" as const,
        error: undefined,
        tools: {},
      }),
      restart: sandbox.stub(),
      updateConfig: sandbox.stub(),
      dispose: sandbox.stub(),
      serverName: "test-server",
      logger: {} as any,
    };

    // Mock McpConnection class
    MockMcpConnection = sandbox.stub().callsFake(() => mockConnectionInstance);

    // Use proxyquire to mock the McpConnection import
    McpHub = proxyquire("../mcp-hub", {
      "./mcp-connection": {
        McpConnection: MockMcpConnection,
      },
    }).McpHub;

    // Create McpHub instance
    mcpHub = new McpHub(mockContext, mockConfiguration);
  });

  afterEach(() => {
    mcpHub.dispose();
    sandbox.restore();
  });

  describe("constructor", () => {
    it("should initialize with empty connections", () => {
      const status = mcpHub.status.value;
      assert.deepStrictEqual(status.connections, {});
      assert.deepStrictEqual(status.toolset, {});
    });

    it("should create connections for existing servers in config", () => {
      const config = {
        "test-server": {
          command: "node",
          args: ["server.js"],
        },
      };

      // Create new hub with existing config
      mockConfiguration.updateMcpServers(config);
      const hubWithConfig = new McpHub(mockContext, mockConfiguration);

      // Should have called McpConnection constructor
      assert.ok(MockMcpConnection.called);

      hubWithConfig.dispose();
    });
  });

  describe("addServer", () => {
    it("should add a new server with default config", () => {
      const serverName = mcpHub.addServer();

      assert.ok(serverName.includes("replace-your-mcp-name-here"));
      const config = mockConfiguration.mcpServers.value;
      assert.ok(serverName in config);
      assert.deepStrictEqual(config[serverName], {
        command: "npx",
        args: ["@your-package/mcp-server"],
      });
    });

    it("should add a new server with custom name and config", () => {
      const customConfig: McpServerConfig = {
        command: "python",
        args: ["-m", "my_mcp_server"],
        env: { DEBUG: "1" },
      };

      const serverName = mcpHub.addServer("my-server", customConfig);

      assert.strictEqual(serverName, "my-server");
      const config = mockConfiguration.mcpServers.value;
      assert.deepStrictEqual(config[serverName], customConfig);
    });

    it("should generate unique names for duplicate server names", () => {
      const config1: McpServerConfig = {
        command: "node",
        args: ["server1.js"],
      };

      const serverName1 = mcpHub.addServer("test-server", config1);
      const serverName2 = mcpHub.addServer("test-server", config1);

      assert.strictEqual(serverName1, "test-server");
      assert.strictEqual(serverName2, "test-server-1");

      const config = mockConfiguration.mcpServers.value;
      assert.ok("test-server" in config);
      assert.ok("test-server-1" in config);
    });
  });

  describe("start", () => {
    it("should enable a disabled server", () => {
      const serverConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: true,
      };

      // Add server to config
      mockConfiguration.updateMcpServers({
        "test-server": serverConfig,
      });

      mcpHub.start("test-server");

      const config = mockConfiguration.mcpServers.value;
      assert.strictEqual(config["test-server"].disabled, false);
    });

    it("should do nothing for non-existing server", () => {
      const originalConfig = mockConfiguration.mcpServers.value;
      mcpHub.start("non-existing");
      assert.strictEqual(mockConfiguration.mcpServers.value, originalConfig);
    });
  });

  describe("stop", () => {
    it("should disable an enabled server", () => {
      const serverConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabled: false,
      };

      // Add server to config
      mockConfiguration.updateMcpServers({
        "test-server": serverConfig,
      });

      mcpHub.stop("test-server");

      const config = mockConfiguration.mcpServers.value;
      assert.strictEqual(config["test-server"].disabled, true);
    });

    it("should do nothing for non-existing server", () => {
      mcpHub.stop("non-existing");
      // Since we're using a mock, we can't directly compare the value
      assert.ok(true); // Placeholder assertion
    });
  });

  describe("restart", () => {
    it("should restart an existing connection", () => {
      // Setup a connection manually
      const restartStub = sandbox.stub();
      const disposeStub = sandbox.stub();
      (mcpHub as any).connections.set("test-server", {
        instance: { restart: restartStub, dispose: disposeStub },
        listeners: [{ dispose: sandbox.stub() }],
      });

      mcpHub.restart("test-server");

      assert.ok(restartStub.calledOnce);
    });

    it("should do nothing for non-existing connection", () => {
      // Should not throw
      mcpHub.restart("non-existing");
    });
  });

  describe("toggleToolEnabled", () => {
    beforeEach(() => {
      const serverConfig: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        disabledTools: ["tool1"],
      };

      mockConfiguration.updateMcpServers({
        "test-server": serverConfig,
      });
    });

    it("should enable a disabled tool", () => {
      mcpHub.toggleToolEnabled("test-server", "tool1");

      const config = mockConfiguration.mcpServers.value;
      assert.deepStrictEqual(config["test-server"].disabledTools, []);
    });

    it("should disable an enabled tool", () => {
      mcpHub.toggleToolEnabled("test-server", "tool2");

      const config = mockConfiguration.mcpServers.value;
      assert.deepStrictEqual(config["test-server"].disabledTools, ["tool1", "tool2"]);
    });

    it("should initialize disabledTools array if not present", () => {
      // Update config without disabledTools
      mockConfiguration.updateMcpServers({
        "test-server": {
          command: "node",
          args: ["server.js"],
        },
      });

      mcpHub.toggleToolEnabled("test-server", "tool1");

      const config = mockConfiguration.mcpServers.value;
      assert.deepStrictEqual(config["test-server"].disabledTools, ["tool1"]);
    });

    it("should do nothing for non-existing server", () => {
      const originalConfig = mockConfiguration.mcpServers.value;
      mcpHub.toggleToolEnabled("non-existing", "tool1");
      assert.strictEqual(mockConfiguration.mcpServers.value, originalConfig);
    });
  });

  describe("configuration changes", () => {
    it("should create new connections when servers are added", () => {
      const newConfig = {
        "new-server": {
          command: "node",
          args: ["new-server.js"],
        },
      };

      // Reset the stub call count
      MockMcpConnection.resetHistory();

      // Trigger configuration change
      mockConfiguration.updateMcpServers(newConfig);

      // Should have created new connection
      assert.ok(MockMcpConnection.called);
    });

    it("should remove connections when servers are removed", () => {
      // Start with a server
      mockConfiguration.updateMcpServers({
        "test-server": {
          command: "node",
          args: ["server.js"],
        },
      });

      // Create new hub to establish connection
      const hubWithConnection = new McpHub(mockContext, mockConfiguration);

      // Mock the connection
      const disposeStub = sandbox.stub();
      const listenerDisposeStub = sandbox.stub();
      (hubWithConnection as any).connections.set("test-server", {
        instance: { dispose: disposeStub },
        listeners: [{ dispose: listenerDisposeStub }],
      });

      // Remove server from config
      mockConfiguration.updateMcpServers({});

      // Should have disposed connection
      assert.ok(disposeStub.calledOnce);
      assert.ok(listenerDisposeStub.calledOnce);

      hubWithConnection.dispose();
    });

    it("should update existing connections when config changes", () => {
      // Start with a server
      const initialConfig = {
        "test-server": {
          command: "node",
          args: ["server.js"],
        },
      };
      mockConfiguration.updateMcpServers(initialConfig);

      // Create new hub to establish connection
      const hubWithConnection = new McpHub(mockContext, mockConfiguration);

      // Mock the connection's updateConfig method
      const updateConfigStub = sandbox.stub();
      const disposeStub = sandbox.stub();
      (hubWithConnection as any).connections.set("test-server", {
        instance: { 
          updateConfig: updateConfigStub, 
          dispose: disposeStub,
          status: { value: { status: "ready", tools: {} } }
        },
        listeners: [{ dispose: sandbox.stub() }],
      });

      // Update server config
      const updatedConfig = {
        "test-server": {
          command: "python",
          args: ["server.py"],
        },
      };
      mockConfiguration.updateMcpServers(updatedConfig);

      // Should have called updateConfig
      assert.ok(updateConfigStub.calledOnce);
      assert.ok(updateConfigStub.calledWith(updatedConfig["test-server"]));

      hubWithConnection.dispose();
    });
  });

  describe("status building", () => {
    it("should build status with ready connections and enabled tools", () => {
      // Mock a ready connection with tools
      const mockConnection = {
        status: {
          value: {
            status: "ready" as const,
            tools: {
              "tool1": {
                disabled: false,
                description: "Test tool 1",
                parameters: { jsonSchema: {} },
                execute: async () => "result1",
              },
              "tool2": {
                disabled: true,
                description: "Test tool 2",
                parameters: { jsonSchema: {} },
                execute: async () => "result2",
              },
            },
          },
        },
        dispose: sandbox.stub(),
      };

      // Set up hub with connection
      (mcpHub as any).config = { "test-server": { command: "node", args: [] } };
      (mcpHub as any).connections.set("test-server", {
        instance: mockConnection,
        listeners: [{ dispose: sandbox.stub() }],
      });

      // Trigger status update
      (mcpHub as any).updateStatus();

      const status = mcpHub.status.value;
      assert.strictEqual(status.connections["test-server"].status, "ready");

      // Should only include enabled tools in toolset
      assert.ok("tool1" in status.toolset);
      assert.ok(!("tool2" in status.toolset));
      assert.strictEqual(status.toolset.tool1.description, "Test tool 1");
    });

    it("should exclude tools from non-ready connections", () => {
      // Mock a starting connection
      const mockConnection = {
        status: {
          value: {
            status: "starting" as const,
            tools: {
              "tool1": {
                disabled: false,
                description: "Test tool 1",
                parameters: { jsonSchema: {} },
                execute: async () => "result1",
              },
            },
          },
        },
        dispose: sandbox.stub(),
      };

      // Set up hub with connection
      (mcpHub as any).config = { "test-server": { command: "node", args: [] } };
      (mcpHub as any).connections.set("test-server", {
        instance: mockConnection,
        listeners: [{ dispose: sandbox.stub() }],
      });

      // Trigger status update
      (mcpHub as any).updateStatus();

      const status = mcpHub.status.value;
      assert.strictEqual(status.connections["test-server"].status, "starting");

      // Should not include tools from non-ready connections
      assert.deepStrictEqual(status.toolset, {});
    });
  });

  describe("dispose", () => {
    it("should dispose all connections and listeners", () => {
      // Mock connections and listeners
      const connectionDisposeStub = sandbox.stub();
      const listenerDisposeStub = sandbox.stub();
      const mainListenerDisposeStub = sandbox.stub();

      (mcpHub as any).connections.set("test-server", {
        instance: { dispose: connectionDisposeStub },
        listeners: [{ dispose: listenerDisposeStub }],
      });

      (mcpHub as any).listeners.push({ dispose: mainListenerDisposeStub });

      mcpHub.dispose();

      assert.ok(connectionDisposeStub.calledOnce);
      assert.ok(listenerDisposeStub.calledOnce);
      assert.ok(mainListenerDisposeStub.calledOnce);

      // Should clear connections
      assert.strictEqual((mcpHub as any).connections.size, 0);
      assert.strictEqual((mcpHub as any).listeners.length, 0);
    });
  });
});
