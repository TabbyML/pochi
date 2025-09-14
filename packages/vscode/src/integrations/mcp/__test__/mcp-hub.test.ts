import * as assert from "assert";
import { describe, it, beforeEach, afterEach } from "mocha";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { container } from "tsyringe";
import { McpHub } from "../mcp-hub";
import { PochiConfiguration } from "../../configuration";
import type { McpServerConfig } from "@getpochi/common/configuration";

describe("McpHub", () => {
  let sandbox: sinon.SinonSandbox;
  let mockContext: vscode.ExtensionContext;
  let mockConfiguration: PochiConfiguration;
  let mcpHub: McpHub;
  let mockConfig: McpServerConfig;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Mock extension context
    mockContext = {
      extension: {
        id: "test-extension-id",
      },
      subscriptions: [],
    } as any;

    // Mock configuration with computed signal
    const mcpServersSignal = { value: {} };
    mockConfiguration = {
      mcpServers: mcpServersSignal,
      updateMcpServers: sandbox.stub(),
    } as any;

    mockConfig = {
      command: "node",
      args: ["server.js"],
      disabled: false,
    };

    // Register mocks in container
    container.registerInstance("vscode.ExtensionContext", mockContext);
    container.registerInstance(PochiConfiguration, mockConfiguration);

    mcpHub = container.resolve(McpHub);
  });

  afterEach(() => {
    mcpHub.dispose();
    container.clearInstances();
    sandbox.restore();
  });

  describe("constructor", () => {
    it("should initialize with status signal", () => {
      assert.ok(mcpHub.status);
      assert.ok(typeof mcpHub.status.value === "object");
    });
  });

  describe("addServer", () => {
    it("should add a new server with default config", () => {
      const serverName = mcpHub.addServer("test-server");
      
      assert.ok(serverName);
      assert.strictEqual(serverName, "test-server");
      assert.ok((mockConfiguration.updateMcpServers as sinon.SinonStub).called);
    });

    it("should add a new server with custom config", () => {
      const serverName = mcpHub.addServer("test-server", mockConfig);
      
      assert.ok(serverName);
      assert.strictEqual(serverName, "test-server");
      sinon.assert.called(mockConfiguration.updateMcpServers as sinon.SinonStub);
    });
  });

  describe("start/stop", () => {
    beforeEach(() => {
      // Mock that the server exists in config
      (mockConfiguration.mcpServers as any).value = {
        "test-server": mockConfig,
      };
    });

    it("should start a server", () => {
      mcpHub.start("test-server");
      sinon.assert.called(mockConfiguration.updateMcpServers as sinon.SinonStub);
    });

    it("should stop a server", () => {
      mcpHub.stop("test-server");
      sinon.assert.called(mockConfiguration.updateMcpServers as sinon.SinonStub);
    });
  });

  describe("getCurrentConfig", () => {
    it("should get current configuration", () => {
      const testConfig = { "test-server": mockConfig };
      (mockConfiguration.mcpServers as any).value = testConfig;
      
      const config = mcpHub.getCurrentConfig();
      assert.deepStrictEqual(config, testConfig);
    });
  });

  describe("toggleToolEnabled", () => {
    beforeEach(() => {
      // Mock that the server exists in config
      (mockConfiguration.mcpServers as any).value = {
        "test-server": mockConfig,
      };
    });

    it("should toggle tool enabled state", () => {
      mcpHub.toggleToolEnabled("test-server", "test-tool");
      sinon.assert.called(mockConfiguration.updateMcpServers as sinon.SinonStub);
    });
  });

  describe("dispose", () => {
    it("should dispose without errors", () => {
      assert.doesNotThrow(() => {
        mcpHub.dispose();
      });
    });
  });

  describe("status signal", () => {
    it("should have reactive status signal", () => {
      assert.ok(mcpHub.status);
      assert.ok(typeof mcpHub.status.value === "object");
    });

    it("should have status with connections property", () => {
      const status = mcpHub.status.value;
      assert.ok("connections" in status);
      assert.ok(typeof status.connections === "object");
    });
  });
});