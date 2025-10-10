import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { experimental_createMCPClient as createClient, type ToolCallOptions } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getLogger } from "../../base";
import { McpConnection } from "../mcp-connection";
import {
  checkUrlIsSseServer,
  isToolEnabledChanged,
  shouldRestartDueToConfigChanged,
} from "../utils";

// Mock dependencies
vi.mock("../../base", () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

const fsmMock = {
  start: vi.fn(),
  stop: vi.fn(),
  send: vi.fn(),
  subscribe: vi.fn((callback) => {
    // Immediately call the callback with the initial state to simulate subscription behavior
    if (callback) {
      callback(fsmMock.state);
    }
    return { unsubscribe: vi.fn() };
  }),
  _state: undefined as { value: string; context: any } | undefined,
  get initialState(): { value: string; context: any } {
    return { value: "stopped", context: { autoReconnectAttempts: 0 } };
  },
  get state(): { value: string; context: any } {
    return this._state || this.initialState;
  },
  set state(newState: { value: string; context: any }) {
    this._state = newState;
  },
};

vi.mock("@xstate/fsm", () => ({
  createMachine: vi.fn((def) => def),
  interpret: vi.fn(() => fsmMock),
}));

vi.mock("ai", () => ({
  experimental_createMCPClient: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn(),
  getDefaultEnvironment: vi.fn(() => ({})),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

vi.mock("../utils", () => ({
  checkUrlIsSseServer: vi.fn(),
  isToolEnabledChanged: vi.fn(),
  readableError: vi.fn((err) =>
    err instanceof Error ? err.message : String(err),
  ),
  shouldRestartDueToConfigChanged: vi.fn(),
}));

const mockedGetLogger = getLogger as Mock;
const mockedCreateClient = createClient as Mock;
const mockedCheckUrlIsSseServer = checkUrlIsSseServer as Mock;
const mockedIsToolEnabledChanged = isToolEnabledChanged as Mock;
const mockedShouldRestartDueToConfigChanged =
  shouldRestartDueToConfigChanged as Mock;

describe("McpConnection", () => {
  let onStatusChanged: Mock;
  const stdioConfig = { command: "node", args: ["server.js"] };
  const mockToolCallOptions: ToolCallOptions = {
    toolCallId: "test-call-id",
    messages: [],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    onStatusChanged = vi.fn();
    fsmMock._state = undefined;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const createConnection = (config: any) => {
    return new McpConnection("testServer", "testClient", config, onStatusChanged);
  };

  it("should initialize and start the FSM if not disabled", () => {
    const config = { ...stdioConfig, disabled: false };
    createConnection(config);
    expect(mockedGetLogger).toHaveBeenCalledWith("MCPConnection(testServer)");
    expect(fsmMock.start).toHaveBeenCalled();
    expect(fsmMock.subscribe).toHaveBeenCalled();
    expect(fsmMock.send).toHaveBeenCalledWith({ type: "start" });
    expect(onStatusChanged).toHaveBeenCalled();
  });

  it("should initialize but not start the FSM if disabled", () => {
    const config = { ...stdioConfig, disabled: true };
    createConnection(config);
    expect(fsmMock.start).toHaveBeenCalled();
    expect(fsmMock.subscribe).toHaveBeenCalled();
    expect(fsmMock.send).not.toHaveBeenCalledWith({ type: "start" });
    expect(onStatusChanged).toHaveBeenCalled();
  });

  describe("updateConfig", () => {
    it("should stop the connection if it becomes disabled", () => {
      const config = { ...stdioConfig, disabled: false };
      const connection = createConnection(config);
      connection.updateConfig({ ...stdioConfig, disabled: true });
      expect(fsmMock.send).toHaveBeenCalledWith({ type: "stop" });
    });

    it("should start the connection if it becomes enabled", () => {
      const config = { ...stdioConfig, disabled: true };
      const connection = createConnection(config);
      connection.updateConfig({ ...stdioConfig, disabled: false });
      expect(fsmMock.send).toHaveBeenCalledWith({ type: "start" });
    });

    it("should restart the connection if config changes require it", () => {
      const oldConfig = { ...stdioConfig, disabled: false };
      const connection = createConnection(oldConfig);
      mockedShouldRestartDueToConfigChanged.mockReturnValue(true);
      const newConfig = { ...stdioConfig, command: "new-cmd", disabled: false };
      connection.updateConfig(newConfig);
      expect(fsmMock.send).toHaveBeenCalledWith({ type: "restart" });
    });

    it("should update status if only tool enablement changes", () => {
      const config = { ...stdioConfig, disabled: false };
      const connection = createConnection(config);
      mockedIsToolEnabledChanged.mockReturnValue(true);
      const newConfig = { ...config, disabledTools: ["toolA"] };
      fsmMock.state = { value: "ready", context: { toolset: { toolA: {} } } };
      connection.updateConfig(newConfig);
      expect(onStatusChanged).toHaveBeenCalledTimes(2); // Initial + update
    });
  });

  describe("restart", () => {
    it("should send a restart event to the FSM", () => {
      const connection = createConnection({ ...stdioConfig, disabled: false });
      connection.restart();
      expect(fsmMock.send).toHaveBeenCalledWith({ type: "restart" });
    });
  });

  describe("buildStatus", () => {
    it("should build status correctly when ready", async () => {
      const mockExecute = vi.fn().mockResolvedValue("tool result");
      const toolset = {
        toolA: {
          description: "A test tool",
          inputSchema: { jsonSchema: { type: "object" } },
          execute: mockExecute,
        },
        toolB: {
          // missing execute
          description: "Another tool",
          inputSchema: { jsonSchema: { type: "object" } },
        },
      };
      const config = { ...stdioConfig, disabled: false, disabledTools: ["toolC"] };
      const connection = createConnection(config);
      fsmMock.state = {
        value: "ready",
        context: { toolset, instructions: "do stuff" },
      };

      // We need to call updateStatus to trigger buildStatus
      (connection as any).updateStatus();

      const status = connection.status;
      expect(status.status).toBe("ready");
      expect(status.instructions).toBe("do stuff");
      expect(status.tools.toolA).toBeDefined();
      expect(status.tools.toolA.description).toBe("A test tool");
      expect(status.tools.toolA.disabled).toBe(false);

      // toolB should not be in the list because it's missing `execute`
      expect(status.tools.toolB).toBeUndefined();

      // Test executing the tool
      const result = await status.tools.toolA.execute(
        { arg1: "value" },
        mockToolCallOptions,
      );
      expect(mockExecute).toHaveBeenCalledWith({ arg1: "value" }, mockToolCallOptions);
      expect(result).toBe("tool result");
    });

    it("should correctly identify a disabled tool", async () => {
      const mockExecute = vi.fn();
      const toolset = {
        toolA: {
          description: "A test tool",
          inputSchema: { jsonSchema: { type: "object" } },
          execute: mockExecute,
        },
      };
      const config = { ...stdioConfig, disabled: false, disabledTools: ["toolA"] };
      const connection = createConnection(config);
      fsmMock.state = {
        value: "ready",
        context: { toolset },
      };

      (connection as any).updateStatus();
      const status = connection.status;
      expect(status.tools.toolA.disabled).toBe(true);

      // Test executing the disabled tool
      await expect(
        status.tools.toolA.execute({}, mockToolCallOptions),
      ).rejects.toThrow("Tool toolA is disabled.");
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe("connect", () => {
    it("should connect with stdio transport", async () => {
      const config = {
        ...stdioConfig,
        disabled: false,
        cwd: ".",
        env: {},
      };
      const connection = createConnection(config);
      const mockClient = {
        tools: vi.fn().mockResolvedValue({}),
        close: vi.fn(),
      };
      mockedCreateClient.mockResolvedValue(mockClient);

      // Manually trigger connect since it's private
      await (connection as any).connect({ signal: new AbortController().signal });

      expect(createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          transport: expect.any(StdioClientTransport),
        }),
      );
      expect(fsmMock.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "connected" }),
      );
    });

    it("should connect with sse transport", async () => {
      const config = {
        transport: "http",
        url: "http://localhost/sse",
        headers: {},
        disabled: false,
      };
      const connection = createConnection(config);
      const mockClient = {
        tools: vi.fn().mockResolvedValue({}),
        close: vi.fn(),
      };
      mockedCheckUrlIsSseServer.mockResolvedValue(true);
      mockedCreateClient.mockResolvedValue(mockClient);

      await (connection as any).connect({ signal: new AbortController().signal });

      expect(createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          transport: { type: "sse", url: config.url, headers: config.headers },
        }),
      );
      expect(fsmMock.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "connected" }),
      );
    });

    it("should connect with streamable http transport", async () => {
      const config = {
        transport: "http",
        url: "http://localhost/http",
        headers: {},
        disabled: false,
      };
      const connection = createConnection(config);
      const mockClient = {
        tools: vi.fn().mockResolvedValue({}),
        close: vi.fn(),
      };
      mockedCheckUrlIsSseServer.mockResolvedValue(false);
      mockedCreateClient.mockResolvedValue(mockClient);

      await (connection as any).connect({ signal: new AbortController().signal });

      expect(createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          transport: expect.any(StreamableHTTPClientTransport),
        }),
      );
      expect(fsmMock.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "connected" }),
      );
    });

    it("should handle connection errors", async () => {
      const config = { ...stdioConfig, disabled: false };
      const connection = createConnection(config);
      const error = new Error("Connection failed");
      mockedCreateClient.mockRejectedValue(error);

      await (connection as any).connect({ signal: new AbortController().signal });

      expect(fsmMock.send).toHaveBeenCalledWith({
        type: "error",
        error: "Connection failed",
      });
    });
  });

  describe("dispose", () => {
    it("should stop the FSM and listeners", () => {
      const unsubscribe = vi.fn();
      (fsmMock.subscribe as Mock).mockReturnValue({ unsubscribe });
      const connection = createConnection({ ...stdioConfig, disabled: false });
      connection.dispose();
      expect(fsmMock.send).toHaveBeenCalledWith({ type: "stop" });
      expect(unsubscribe).toHaveBeenCalled();
      expect(fsmMock.stop).toHaveBeenCalled();
    });
  });
});
