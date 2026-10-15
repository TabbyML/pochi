import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  port: vi.fn(),
  proxy: vi.fn(),
  close: vi.fn(),
  child: { on: vi.fn(), unref: vi.fn() },
}));
vi.mock("node:child_process", () => ({ spawn: mocks.close }));
vi.mock("../../base", () => ({
  getLogger: () => ({ trace() {}, error() {} }),
}));
vi.mock("node:fs", () => ({ existsSync: mocks.exists }));
vi.mock("../../cors-proxy", () => ({
  getCorsProxyUrl: mocks.proxy,
}));
vi.mock("../utils", () => ({ getAvailablePort: mocks.port }));
import { BrowserSessionStore } from "../browser-session-store";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exists.mockReturnValue(true);
  mocks.port.mockResolvedValue(43210);
  mocks.proxy.mockImplementation(
    (url: string) =>
      `http://localhost:123/?proxy-url=${encodeURIComponent(url)}`,
  );
  mocks.close.mockReturnValue(mocks.child);
});

describe("browser session lifecycle", () => {
  it("deduplicates registration and preserves direct CLI streaming", async () => {
    const store = new BrowserSessionStore();
    const [first, second] = await Promise.all([
      store.registerBrowserSession("task", undefined, true),
      store.registerBrowserSession("task", undefined, true),
    ]);
    expect(first).toBe(second);
    expect(mocks.port).toHaveBeenCalledTimes(1);
    expect(first.streamUrl).toBe("ws://localhost:43210");
    expect(mocks.proxy).not.toHaveBeenCalled();
    expect(store.getAgentBrowserEnvs("task")).toMatchObject({
      AGENT_BROWSER_SESSION: "task",
      AGENT_BROWSER_STREAM_PORT: "43210",
      PATH: expect.stringContaining(
        `${path.join(os.homedir(), ".pochi", "bin")}${path.delimiter}`,
      ),
    });
    store.dispose();
    expect(mocks.close).toHaveBeenCalledWith(
      path.join(
        os.homedir(),
        ".pochi",
        "bin",
        process.platform === "win32" ? "agent-browser.exe" : "agent-browser",
      ),
      ["close"],
      expect.anything(),
    );
  });

  it("uses the shared proxy with ACK pacing and only closes the requested session", async () => {
    const store = new BrowserSessionStore({ proxyStreams: true });
    const session = await store.registerBrowserSession("task");
    const url = new URL(session.streamUrl!);
    expect(url.protocol).toBe("ws:");
    expect(url.host).toBe("localhost:123");
    expect(url.searchParams.get("proxy-url")).toBe(
      "ws://127.0.0.1:43210/?pacing=ack",
    );
    expect(store.getAgentBrowserEnvs("task")?.AGENT_BROWSER_STREAM_PORT).toBe(
      "43210",
    );
    mocks.port.mockResolvedValueOnce(43211);
    await store.registerBrowserSession("other-task");
    await store.unregisterBrowserSession("task");
    await store.unregisterBrowserSession("task");
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.close.mock.calls[0][2].env.AGENT_BROWSER_SESSION).toBe("task");
    expect(store.getAgentBrowserEnvs("task")).toBeUndefined();
    expect(store.getAgentBrowserEnvs("unknown")).toBeUndefined();
    expect(store.getAgentBrowserEnvs("other-task")?.AGENT_BROWSER_SESSION).toBe(
      "other-task",
    );
    store.dispose();
  });

  it("does not leave a session behind if it is cancelled during port allocation", async () => {
    let finish!: (port: number) => void;
    mocks.port.mockReturnValue(
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
    );
    const store = new BrowserSessionStore({ proxyStreams: true });
    const registered = store.registerBrowserSession("task");
    const rejected = expect(registered).rejects.toThrow("cancelled");
    await vi.waitFor(() => expect(mocks.port).toHaveBeenCalled());
    await store.unregisterBrowserSession("task");
    finish(43210);
    await rejected;
    expect(store.browserSessions.value).toEqual({});
    expect(mocks.proxy).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it("does not publish a stream whose port allocation outlives the store", async () => {
    let finish!: (port: number) => void;
    mocks.port.mockReturnValue(
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
    );
    const store = new BrowserSessionStore({ proxyStreams: true });
    const registered = store.registerBrowserSession("task");
    const rejected = expect(registered).rejects.toThrow("cancelled");
    await vi.waitFor(() => expect(mocks.port).toHaveBeenCalled());
    store.dispose();
    finish(43210);
    await rejected;
    expect(store.browserSessions.value).toEqual({});
    expect(mocks.proxy).not.toHaveBeenCalled();
  });

  it("cancels pending children when their parent closes during port allocation", async () => {
    let finish!: (port: number) => void;
    mocks.port.mockReturnValue(
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
    );
    const store = new BrowserSessionStore({ proxyStreams: true });
    // The tool can register first, followed by the preview with its parent ID.
    const tool = store.registerBrowserSession("child");
    const preview = store.registerBrowserSession("child", "parent");
    const rejected = Promise.all([
      expect(tool).rejects.toThrow("cancelled"),
      expect(preview).rejects.toThrow("cancelled"),
    ]);
    await vi.waitFor(() => expect(mocks.port).toHaveBeenCalled());
    await store.unregisterSubtaskBrowserSessions("parent");
    finish(43210);
    await rejected;
    expect(store.browserSessions.value).toEqual({});
    expect(mocks.proxy).not.toHaveBeenCalled();
  });
});

it("registers without streaming or an installed CLI and falls back to PATH for cleanup", async () => {
  mocks.exists.mockReturnValue(false);
  const store = new BrowserSessionStore();
  await store.registerBrowserSession("no-cli");
  expect(store.getAgentBrowserEnvs("no-cli")).toMatchObject({
    AGENT_BROWSER_SESSION: "no-cli",
  });
  expect(mocks.port).not.toHaveBeenCalled();
  expect(mocks.proxy).not.toHaveBeenCalled();
  await store.unregisterBrowserSession("no-cli");
  expect(mocks.close).toHaveBeenCalledWith(
    "agent-browser",
    ["close"],
    expect.objectContaining({
      env: expect.objectContaining({ AGENT_BROWSER_SESSION: "no-cli" }),
    }),
  );
});

it("cancels registration before preparation starts", async () => {
  const store = new BrowserSessionStore();
  const registering = store.registerBrowserSession("cancelled");
  const rejected = expect(registering).rejects.toThrow("cancelled");
  await store.unregisterBrowserSession("cancelled");
  await rejected;
  expect(store.browserSessions.value).toEqual({});
  expect(mocks.close).not.toHaveBeenCalled();
});

it("cleans up a tool-created child without waiting for a preview", async () => {
  const store = new BrowserSessionStore();
  await store.registerBrowserSession("child", "parent");
  await store.unregisterSubtaskBrowserSessions("parent");
  expect(store.browserSessions.value).toEqual({});
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.close.mock.calls[0][2].env.AGENT_BROWSER_SESSION).toBe("child");
});
