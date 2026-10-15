import { afterEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  registerBrowserSession: vi.fn(),
  unregisterBrowserSession: vi.fn(),
}));
vi.mock("../vscode", () => ({ vscodeHost: host }));
vi.mock("@/lib/remote-blob-store", () => ({ blobStore: {} }));
vi.mock("@getpochi/livekit", () => ({ catalog: {} }));
vi.mock("@getpochi/common", () => ({ getLogger: () => ({ error() {} }) }));
import {
  BrowserRecordingSession,
  BrowserSessionManager,
} from "../browser-session-manager";

class TestSocket {
  static OPEN = 1;
  static instances: TestSocket[] = [];
  readyState = 1;
  send = vi.fn();
  onmessage?: (event: { data: string }) => Promise<void>;
  onclose: unknown;
  onerror: unknown;
  constructor() {
    TestSocket.instances.push(this);
  }
  close() {
    this.readyState = 3;
  }
}
afterEach(() => {
  TestSocket.instances = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("browser stream consumption", () => {
  it.each([false, true])(
    "acks only after consumption and never on a closed socket (closed: %s)",
    async (closed) => {
      vi.stubGlobal("WebSocket", TestSocket);
      let finish!: () => void;
      const session = new BrowserRecordingSession("task", {});
      (session as unknown as { addFrame: () => Promise<void> }).addFrame = () =>
        new Promise((resolve) => {
          finish = resolve;
        });
      session.startStreaming("ws://fixture");
      const socket = TestSocket.instances[0];
      const handled = socket.onmessage!({
        data: JSON.stringify({ type: "frame", seq: 42, data: "image" }),
      });
      expect(socket.send).not.toHaveBeenCalled();
      if (closed) socket.close();
      finish();
      await handled;
      if (closed) expect(socket.send).not.toHaveBeenCalled();
      else
        expect(socket.send).toHaveBeenCalledWith(
          JSON.stringify({ type: "ack", seq: 42 }),
        );
    },
  );

  it("does not reopen a viewer after unregistration during registration", async () => {
    vi.stubGlobal("WebSocket", TestSocket);
    let finish!: (value: { streamUrl: string }) => void;
    host.registerBrowserSession.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const manager = new BrowserSessionManager();
    const registering = manager.registerSession("task", "parent", {});
    await manager.unregisterSession("task", "call", {} as never);
    finish({ streamUrl: "ws://fixture" });
    await registering;
    expect(manager.isRegistered("task")).toBe(false);
    expect(TestSocket.instances).toHaveLength(0);
    expect(host.unregisterBrowserSession).toHaveBeenCalledWith("task");
  });

  it("allows a later retry when preparation fails", async () => {
    host.registerBrowserSession.mockRejectedValue(
      new Error("Stream setup failed"),
    );
    const manager = new BrowserSessionManager();
    await manager.registerSession("task", "parent", {});
    expect(manager.isRegistered("task")).toBe(false);
  });
});

describe("preview and recording are independent", () => {
  it("renders and acknowledges frames without a recording encoder, and replays the latest frame to a remounted view", async () => {
    vi.stubGlobal("WebSocket", TestSocket);
    vi.stubGlobal("VideoEncoder", undefined);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 1280, height: 720, close() {} })),
    );
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return { fillRect() {}, drawImage() {} };
        }
        transferToImageBitmap() {
          return { width: 1280, height: 720, close() {} };
        }
      },
    );
    const manager = new BrowserSessionManager();
    const preview = vi.fn();
    const unsubscribe = manager.subscribeFrame("no-codec", preview);
    const session = new BrowserRecordingSession("no-codec", {});
    session.startStreaming("ws://fixture");
    const socket = TestSocket.instances[0];
    await socket.onmessage!({
      data: JSON.stringify({ type: "frame", seq: 1, data: "aW1hZ2U=" }),
    });
    expect(preview).toHaveBeenCalledWith("aW1hZ2U=");
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "ack", seq: 1 }),
    );
    unsubscribe();
    const remounted = vi.fn();
    const detach = manager.subscribeFrame("no-codec", remounted);
    expect(remounted).toHaveBeenCalledWith("aW1hZ2U=");
    await session.stopStreaming("call", {} as never);
    detach();
  });

  it("deduplicates registration and waits for a single pending cleanup", async () => {
    vi.stubGlobal("WebSocket", TestSocket);
    host.registerBrowserSession.mockResolvedValue({
      streamUrl: "ws://fixture",
    });
    const manager = new BrowserSessionManager();
    await Promise.all([
      manager.registerSession("dedup", "parent", {}),
      manager.registerSession("dedup", "parent", {}),
    ]);
    expect(host.registerBrowserSession).toHaveBeenCalledTimes(1);
    expect(TestSocket.instances).toHaveLength(1);
    let finish!: () => void;
    const releasing = new Promise<void>((resolve) => {
      finish = resolve;
    });
    host.unregisterBrowserSession.mockReturnValue(releasing);
    const first = manager.unregisterSession("dedup", "call", {} as never);
    const second = manager.unregisterSession("dedup", "call", {} as never);
    await vi.waitFor(() =>
      expect(host.unregisterBrowserSession).toHaveBeenCalledTimes(1),
    );
    finish();
    await Promise.all([first, second]);
    expect(manager.isRegistered("dedup")).toBe(false);
  });
});

it("waits for an accepted frame to finish decoding before ending the recording", async () => {
  vi.stubGlobal("WebSocket", TestSocket);
  vi.stubGlobal("VideoEncoder", undefined);
  let finishDecode!: (bitmap: unknown) => void;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(
      () =>
        new Promise((resolve) => {
          finishDecode = resolve;
        }),
    ),
  );
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      getContext() {
        return { fillRect() {}, drawImage() {} };
      }
      transferToImageBitmap() {
        return { width: 1280, height: 720, close() {} };
      }
    },
  );
  const session = new BrowserRecordingSession("drain", {});
  session.startStreaming("ws://fixture");
  const socket = TestSocket.instances[0];
  const receiving = socket.onmessage!({
    data: JSON.stringify({ type: "frame", seq: 1, data: "aW1hZ2U=" }),
  });
  let stopped = false;
  const stopping = session.stopStreaming("call", {} as never).then(() => {
    stopped = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(stopped).toBe(false);
  expect(socket.readyState).toBe(3);
  finishDecode({ width: 1280, height: 720, close() {} });
  await Promise.all([receiving, stopping]);
  expect(stopped).toBe(true);
  expect(socket.send).not.toHaveBeenCalled();
});

describe("host session cleanup", () => {
  it("releases a host-only session without a local recorder and deduplicates cleanup", async () => {
    host.registerBrowserSession.mockResolvedValue({});
    await host.registerBrowserSession("host-only");
    const manager = new BrowserSessionManager();
    let finish!: () => void;
    host.unregisterBrowserSession.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const first = manager.unregisterSession("host-only", "call", {} as never);
    const second = manager.unregisterSession("host-only", "call", {} as never);
    await vi.waitFor(() =>
      expect(host.unregisterBrowserSession).toHaveBeenCalledOnce(),
    );
    expect(host.unregisterBrowserSession).toHaveBeenCalledWith("host-only");
    finish();
    await Promise.all([first, second]);
  });

  it("releases the host even when recording finalization throws", async () => {
    host.registerBrowserSession.mockResolvedValue({});
    host.unregisterBrowserSession.mockResolvedValue(undefined);
    const manager = new BrowserSessionManager();
    await manager.registerSession("flush-error", "parent", {});
    const sessions = (
      manager as unknown as {
        browserSessions: Map<string, BrowserRecordingSession>;
      }
    ).browserSessions;
    vi.spyOn(sessions.get("flush-error")!, "stopStreaming").mockRejectedValue(
      new Error("Encoder failed"),
    );
    await manager.unregisterSession("flush-error", "call", {} as never);
    expect(host.unregisterBrowserSession).toHaveBeenCalledWith("flush-error");
    expect(manager.isRegistered("flush-error")).toBe(false);
  });

  it("can retry a failed host cleanup without a local recorder", async () => {
    host.unregisterBrowserSession
      .mockRejectedValueOnce(new Error("Host unavailable"))
      .mockResolvedValue(undefined);
    const manager = new BrowserSessionManager();
    await manager.unregisterSession("retry-close", "call", {} as never);
    await manager.unregisterSession("retry-close", "call", {} as never);
    expect(host.unregisterBrowserSession).toHaveBeenCalledTimes(2);
  });
});
