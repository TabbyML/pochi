import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { signal, type Signal } from "@preact/signals-core";
import type { McpTool } from "@getpochi/tools";
import type { ToolCallOptions } from "ai";
import { McpHub } from "../mcp-hub";
import type { McpServerConfig } from "../../configuration/index.js";
import { McpConnection } from "../mcp-connection";
import type { McpToolExecutable } from "../types";

// Mock dependencies
vi.mock("../../base", () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("../../configuration/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../configuration/index.js")>();
  return {
    ...actual,
    updatePochiConfig: vi.fn().mockResolvedValue(undefined),
    inspectPochiConfig: vi.fn().mockReturnValue({
      effectiveTargets: ["user"],
    }),
  };
});

vi.mock("../mcp-connection", () => ({
  McpConnection: vi.fn(),
}));

const configModule = await import("../../configuration/index.js");
const mockedUpdatePochiConfig = configModule.updatePochiConfig as Mock;
const mockedInspectPochiConfig = configModule.inspectPochiConfig as Mock;
const MockedMcpConnection = McpConnection as unknown as Mock;

describe("McpHub", () => {
  let configSignal: Signal<Record<string, McpServerConfig>>;
  let vendorToolsSignal: Signal<
    Record<string, Record<string, McpTool & McpToolExecutable>>
  >;
  let mockConnection: {
    status: any;
    restart: Mock;
    updateConfig: Mock;
    dispose: Mock;
  };
  const mockToolCallOptions: ToolCallOptions = {
    toolCallId: "test-call-id",
    messages: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset the mock to return a resolved promise
    mockedUpdatePochiConfig.mockResolvedValue(undefined);
    mockedInspectPochiConfig.mockReturnValue({
      effectiveTargets: ["user"],
    });
    
    configSignal = signal<Record<string, McpServerConfig>>({});
    vendorToolsSignal = signal<
      Record<string, Record<string, McpTool & McpToolExecutable>>
    >({});

    mockConnection = {
      status: {
        status: "ready" as const,
        error: undefined,
        tools: {},
        instructions: undefined,
      },
      restart: vi.fn(),
      updateConfig: vi.fn(),
      dispose: vi.fn(),
    };

    MockedMcpConnection.mockImplementation(() => mockConnection as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with empty config", () => {
      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      expect(hub.status.value.connections).toEqual({});
      expect(hub.status.value.toolset).toEqual({});
      expect(hub.status.value.instructions).toBe("");

      hub.dispose();
    });

    it("should initialize with existing servers in config", () => {
      configSignal.value = {
        server1: {
          command: "node",
          args: ["server.js"],
          disabled: false,
        },
        server2: {
          url: "http://localhost:3000",
          disabled: true,
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      expect(MockedMcpConnection).toHaveBeenCalledTimes(2);
      expect(MockedMcpConnection).toHaveBeenCalledWith(
        "server1",
        "pochi",
        expect.objectContaining({ command: "node" }),
        expect.any(Function),
      );
      expect(MockedMcpConnection).toHaveBeenCalledWith(
        "server2",
        "pochi",
        expect.objectContaining({ url: "http://localhost:3000" }),
        expect.any(Function),
      );

      hub.dispose();
    });

    it("should use custom client name", () => {
      configSignal.value = {
        server1: {
          command: "node",
          args: ["server.js"],
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
        clientName: "custom-client",
      });

      expect(MockedMcpConnection).toHaveBeenCalledWith(
        "server1",
        "custom-client",
        expect.any(Object),
        expect.any(Function),
      );

      hub.dispose();
    });
  });

  describe("restart", () => {
    it("should restart an existing connection", () => {
      configSignal.value = {
        server1: {
          command: "node",
          args: ["server.js"],
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      hub.restart("server1");

      expect(mockConnection.restart).toHaveBeenCalled();

      hub.dispose();
    });

    it("should not throw when restarting non-existing connection", () => {
      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      expect(() => hub.restart("non-existing")).not.toThrow();

      hub.dispose();
    });
  });

  describe("start", () => {
    it("should enable a disabled server", async () => {
      configSignal.value = {
        server1: {
          command: "node",
          args: ["server.js"],
          disabled: true,
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      hub.start("server1");

      expect(mockedUpdatePochiConfig).toHaveBeenCalledWith({
        mcp: {
          server1: {
            command: "node",
            args: ["server.js"],
            disabled: false,
          },
        },
      }, "user");

      hub.dispose();
    });

    it("should not throw when starting non-existing server", () => {
      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      expect(() => hub.start("non-existing")).not.toThrow();

      hub.dispose();
    });
  });

  describe("stop", () => {
    it("should disable an enabled server", async () => {
      configSignal.value = {
        server1: {
          command: "node",
          args: ["server.js"],
          disabled: false,
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      hub.stop("server1");

      expect(mockedUpdatePochiConfig).toHaveBeenCalledWith({
        mcp: {
          server1: {
            command: "node",
            args: ["server.js"],
            disabled: true,
          },
        },
      }, "user");

      hub.dispose();
    });

    it("should not throw when stopping non-existing server", () => {
      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      expect(() => hub.stop("non-existing")).not.toThrow();

      hub.dispose();
    });
  });

  describe("addServer", () => {
    it("should add a new server with provided name", async () => {
      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      const newConfig: McpServerConfig = {
        command: "node",
        args: ["new-server.js"],
      };

      const serverName = await hub.addServer("myserver", newConfig);

      expect(serverName).toBe("myserver");
      expect(mockedUpdatePochiConfig).toHaveBeenCalledWith({
        mcp: {
          myserver: newConfig,
        },
      }, "user");

      hub.dispose();
    });

    it("should generate unique name if name already exists", async () => {
      configSignal.value = {
        myserver: {
          command: "existing",
          args: [],
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      const newConfig: McpServerConfig = {
        command: "node",
        args: ["new-server.js"],
      };

      const serverName = await hub.addServer("myserver", newConfig);

      expect(serverName).toBe("myserver-1");
      // The implementation saves each server configuration individually
      expect(mockedUpdatePochiConfig).toHaveBeenCalledTimes(2);
      expect(mockedUpdatePochiConfig).toHaveBeenCalledWith({
        mcp: {
          myserver: {
            command: "existing",
            args: [],
          },
        },
      }, "user");
      expect(mockedUpdatePochiConfig).toHaveBeenCalledWith({
        mcp: {
          "myserver-1": newConfig,
        },
      }, "user");

      hub.dispose();
    });

    it("should generate default name if name not provided", async () => {
      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      const newConfig: McpServerConfig = {
        command: "node",
        args: ["new-server.js"],
      };

      const serverName = await hub.addServer(undefined, newConfig);

      expect(serverName).toBe("server");
      expect(mockedUpdatePochiConfig).toHaveBeenCalledWith({
        mcp: {
          server: newConfig,
        },
      }, "user");

      hub.dispose();
    });

    it("should throw error if serverConfig not provided", async () => {
      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      await expect(hub.addServer("test", undefined as any)).rejects.toThrow(
        "Server configuration is required",
      );

      hub.dispose();
    });

    it("should handle config save errors gracefully", async () => {
      mockedUpdatePochiConfig.mockRejectedValueOnce(new Error("Save failed"));

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      const newConfig: McpServerConfig = {
        command: "node",
        args: ["new-server.js"],
      };

      const serverName = await hub.addServer("test", newConfig);

      // Should still return the server name even if save fails
      expect(serverName).toBe("test");

      hub.dispose();
    });
  });

  describe("addServers", () => {
    it("should add multiple servers at once", async () => {
      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      const servers = [
        {
          name: "server1",
          command: "node" as const,
          args: ["s1.js"],
        },
        {
          name: "server2",
          command: "node" as const,
          args: ["s2.js"],
        },
      ];

      const addedNames = hub.addServers(servers);

      // Wait for async saveConfig operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(addedNames).toEqual(["server1", "server2"]);
      // The implementation saves each server configuration individually
      expect(mockedUpdatePochiConfig).toHaveBeenCalledTimes(2);
      expect(mockedUpdatePochiConfig).toHaveBeenCalledWith({
        mcp: {
          server1: { command: "node", args: ["s1.js"] },
        },
      }, "user");
      expect(mockedUpdatePochiConfig).toHaveBeenCalledWith({
        mcp: {
          server2: { command: "node", args: ["s2.js"] },
        },
      }, "user");

      hub.dispose();
    });

    it("should generate unique names for duplicate server names", () => {
      configSignal.value = {
        server1: {
          command: "existing",
          args: [],
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      const servers = [
        {
          name: "server1",
          command: "node" as const,
          args: ["new1.js"],
        },
        {
          name: "server1",
          command: "node" as const,
          args: ["new2.js"],
        },
      ];

      const addedNames = hub.addServers(servers);

      expect(addedNames).toEqual(["server1-1", "server1-2"]);

      hub.dispose();
    });
  });

  describe("toggleToolEnabled", () => {
    it("should disable an enabled tool", () => {
      configSignal.value = {
        server1: {
          command: "node",
          args: ["server.js"],
          disabledTools: [],
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      hub.toggleToolEnabled("server1", "toolA");

      expect(mockedUpdatePochiConfig).toHaveBeenCalledWith({
        mcp: {
          server1: {
            command: "node",
            args: ["server.js"],
            disabledTools: ["toolA"],
          },
        },
      }, "user");

      hub.dispose();
    });

    it("should enable a disabled tool", () => {
      configSignal.value = {
        server1: {
          command: "node",
          args: ["server.js"],
          disabledTools: ["toolA", "toolB"],
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      hub.toggleToolEnabled("server1", "toolA");

      expect(mockedUpdatePochiConfig).toHaveBeenCalledWith({
        mcp: {
          server1: {
            command: "node",
            args: ["server.js"],
            disabledTools: ["toolB"],
          },
        },
      }, "user");

      hub.dispose();
    });

    it("should not throw when toggling tool for non-existing server", () => {
      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      expect(() => hub.toggleToolEnabled("non-existing", "toolA")).not.toThrow();

      hub.dispose();
    });

    it("should handle server config without disabledTools array", () => {
      configSignal.value = {
        server1: {
          command: "node",
          args: ["server.js"],
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      hub.toggleToolEnabled("server1", "toolA");

      expect(mockedUpdatePochiConfig).toHaveBeenCalledWith({
        mcp: {
          server1: {
            command: "node",
            args: ["server.js"],
            disabledTools: ["toolA"],
          },
        },
      }, "user");

      hub.dispose();
    });
  });

  describe("getCurrentConfig", () => {
    it("should return current config", () => {
      const config = {
        server1: {
          command: "node" as const,
          args: ["server.js"],
        },
      };
      configSignal.value = config;

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      const currentConfig = hub.getCurrentConfig();

      expect(currentConfig).toEqual(config);
      // Should return a copy, not the original
      expect(currentConfig).not.toBe(configSignal.value);

      hub.dispose();
    });
  });

  describe("status", () => {
    it("should build status with vendor tools", () => {
      const mockExecute = vi.fn().mockResolvedValue("result");
      vendorToolsSignal.value = {
        "vendor1": {
          "tool1": {
            description: "Vendor tool 1",
            inputSchema: {
              jsonSchema: { type: "object" },
            },
            execute: mockExecute,
          },
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      const status = hub.status.value;

      expect(status.connections["vendor1"]).toEqual({
        status: "ready",
        error: undefined,
        kind: "vendor",
        tools: {
          tool1: {
            description: "Vendor tool 1",
            inputSchema: {
              jsonSchema: { type: "object" },
            },
            disabled: false,
          },
        },
      });

      expect(status.toolset["tool1"]).toEqual({
        description: "Vendor tool 1",
        inputSchema: {
          jsonSchema: { type: "object" },
        },
      });

      hub.dispose();
    });

    it("should build status with mcp server connections", () => {
      mockConnection.status = {
        status: "ready",
        error: undefined,
        tools: {
          tool1: {
            description: "Server tool 1",
            inputSchema: {
              jsonSchema: { type: "object" },
            },
            disabled: false,
            execute: vi.fn(),
          },
        },
        instructions: "Test instructions",
      };

      configSignal.value = {
        server1: {
          command: "node",
          args: ["server.js"],
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      const status = hub.status.value;

      expect(status.connections["server1"]).toEqual({
        status: "ready",
        error: undefined,
        tools: {
          tool1: {
            description: "Server tool 1",
            inputSchema: {
              jsonSchema: { type: "object" },
            },
            disabled: false,
          },
        },
        instructions: "Test instructions",
      });

      expect(status.toolset["tool1"]).toEqual({
        description: "Server tool 1",
        inputSchema: {
          jsonSchema: { type: "object" },
        },
      });

      expect(status.instructions).toBe("# Instructions from server1 mcp server\nTest instructions");

      hub.dispose();
    });

    it("should exclude disabled tools from toolset", () => {
      mockConnection.status = {
        status: "ready",
        error: undefined,
        tools: {
          tool1: {
            description: "Enabled tool",
            inputSchema: {
              jsonSchema: { type: "object" },
            },
            disabled: false,
            execute: vi.fn(),
          },
          tool2: {
            description: "Disabled tool",
            inputSchema: {
              jsonSchema: { type: "object" },
            },
            disabled: true,
            execute: vi.fn(),
          },
        },
      };

      configSignal.value = {
        server1: {
          command: "node",
          args: ["server.js"],
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      const status = hub.status.value;

      expect(status.toolset["tool1"]).toBeDefined();
      expect(status.toolset["tool2"]).toBeUndefined();

      hub.dispose();
    });

    it("should not include connections that are not ready in toolset", () => {
      mockConnection.status = {
        status: "error",
        error: "Connection failed",
        tools: {
          tool1: {
            description: "Tool",
            inputSchema: {
              jsonSchema: { type: "object" },
            },
            disabled: false,
            execute: vi.fn(),
          },
        },
      };

      configSignal.value = {
        server1: {
          command: "node",
          args: ["server.js"],
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      const status = hub.status.value;

      expect(status.connections["server1"].status).toBe("error");
      expect(status.toolset).toEqual({});

      hub.dispose();
    });

    it("should merge instructions from multiple servers", () => {
      const mockConnection1 = {
        status: {
          status: "ready" as const,
          error: undefined,
          tools: {},
          instructions: "Instructions from server1",
        },
        restart: vi.fn(),
        updateConfig: vi.fn(),
        dispose: vi.fn(),
      };

      const mockConnection2 = {
        status: {
          status: "ready" as const,
          error: undefined,
          tools: {},
          instructions: "Instructions from server2",
        },
        restart: vi.fn(),
        updateConfig: vi.fn(),
        dispose: vi.fn(),
      };

      MockedMcpConnection.mockImplementationOnce(() => mockConnection1 as any);
      MockedMcpConnection.mockImplementationOnce(() => mockConnection2 as any);

      configSignal.value = {
        server1: { command: "node", args: ["s1.js"] },
        server2: { command: "node", args: ["s2.js"] },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      const status = hub.status.value;

      expect(status.instructions).toBe(
        "# Instructions from server1 mcp server\nInstructions from server1\n\n# Instructions from server2 mcp server\nInstructions from server2",
      );

      hub.dispose();
    });
  });

  describe("executeFns", () => {
    it("should provide execute functions separately", async () => {
      const mockExecute = vi.fn().mockResolvedValue("result");
      mockConnection.status = {
        status: "ready",
        error: undefined,
        tools: {
          tool1: {
            description: "Tool 1",
            inputSchema: {
              jsonSchema: { type: "object" },
            },
            disabled: false,
            execute: mockExecute,
          },
        },
      };

      configSignal.value = {
        server1: {
          command: "node",
          args: ["server.js"],
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      const executeFns = hub.executeFns.value;

      expect(executeFns["tool1"]).toBeDefined();
      expect(typeof executeFns["tool1"]).toBe("function");

      const result = await executeFns["tool1"]({ arg: "value" }, mockToolCallOptions);

      expect(mockExecute).toHaveBeenCalledWith(
        { arg: "value" },
        mockToolCallOptions,
      );
      expect(result).toBe("result");

      hub.dispose();
    });
  });

  describe("config changes", () => {
    it("should create new connections when servers are added", () => {
      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      configSignal.value = {
        server1: {
          command: "node",
          args: ["server.js"],
        },
      };

      expect(MockedMcpConnection).toHaveBeenCalledWith(
        "server1",
        "pochi",
        expect.objectContaining({ command: "node" }),
        expect.any(Function),
      );

      hub.dispose();
    });

    it("should update connections when config changes", () => {
      configSignal.value = {
        server1: {
          command: "node",
          args: ["server.js"],
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      const newConfig = {
        command: "node" as const,
        args: ["updated.js"],
      };

      configSignal.value = {
        server1: newConfig,
      };

      expect(mockConnection.updateConfig).toHaveBeenCalledWith(newConfig);

      hub.dispose();
    });

    it("should remove connections when servers are removed from config", () => {
      configSignal.value = {
        server1: {
          command: "node",
          args: ["server.js"],
        },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      configSignal.value = {};

      expect(mockConnection.dispose).toHaveBeenCalled();

      hub.dispose();
    });
  });

  describe("dispose", () => {
    it("should dispose all connections and listeners", () => {
      configSignal.value = {
        server1: { command: "node", args: ["s1.js"] },
        server2: { command: "node", args: ["s2.js"] },
      };

      const mockConnection2 = {
        status: { status: "ready", error: undefined, tools: {} },
        restart: vi.fn(),
        updateConfig: vi.fn(),
        dispose: vi.fn(),
      };

      MockedMcpConnection.mockImplementationOnce(() => mockConnection as any);
      MockedMcpConnection.mockImplementationOnce(() => mockConnection2 as any);

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      hub.dispose();

      expect(mockConnection.dispose).toHaveBeenCalled();
      expect(mockConnection2.dispose).toHaveBeenCalled();

      // Config changes should not trigger after dispose
      vi.clearAllMocks();
      configSignal.value = {
        server3: { command: "node", args: ["s3.js"] },
      };

      // Should not create new connection after dispose
      expect(MockedMcpConnection).not.toHaveBeenCalled();
    });

    it("should clear all connections after dispose", () => {
      configSignal.value = {
        server1: { command: "node", args: ["server.js"] },
      };

      const hub = new McpHub({
        config: configSignal,
        vendorTools: vendorToolsSignal,
      });

      hub.dispose();

      // Accessing internal state - connections should be empty
      // We can test this indirectly by checking restart doesn't affect anything
      expect(() => hub.restart("server1")).not.toThrow();
    });
  });
});
