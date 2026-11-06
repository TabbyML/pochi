import { afterEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({
  registerBrowserSession: vi.fn(),
  unregisterBrowserSession: vi.fn(async (_taskId: string) => {}),
}));
vi.mock("../vscode", () => ({ vscodeHost: host }));
const blob = vi.hoisted(() => {
  class UploadError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  return { UploadError, blobStore: { put: vi.fn() } };
});
vi.mock("@/lib/remote-blob-store", () => blob);
vi.mock("@getpochi/livekit", () => ({
  catalog: { events: { writeStoreFile: (file: unknown) => file } },
}));
vi.mock("@getpochi/common", () => ({
  getLogger: () => ({ error() {}, warn() {} }),
}));
import {
  BrowserRecordingSession,
  BrowserSessionManager,
  RecordingUploadRetryDelaysMs,
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
  vi.useRealTimers();
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

  it("closes the host while recording finalization is still pending", async () => {
    host.registerBrowserSession.mockResolvedValue({});
    const manager = new BrowserSessionManager();
    await manager.registerSession("slow-upload", "parent", {});
    const sessions = (
      manager as unknown as { browserSessions: Map<string, BrowserRecordingSession> }
    ).browserSessions;
    let finishUpload!: () => void;
    vi.spyOn(sessions.get("slow-upload")!, "stopStreaming").mockReturnValue(
      new Promise<void>((resolve) => { finishUpload = resolve; }),
    );
    const first = manager.unregisterSession("slow-upload", "call", {} as never);
    const second = manager.unregisterSession("slow-upload", "call", {} as never);
    try {
      expect(host.unregisterBrowserSession).toHaveBeenCalledExactlyOnceWith("slow-upload");
      expect(manager.isRegistered("slow-upload")).toBe(false);
    } finally {
      finishUpload();
      await Promise.all([first, second]);
    }
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

describe("recording upload", () => {
  async function stopWithRecording(manager: BrowserSessionManager, taskId: string) {
    host.registerBrowserSession.mockResolvedValue({});
    host.unregisterBrowserSession.mockResolvedValue(undefined);
    await manager.registerSession(taskId, "parent", {});
    const session = (
      manager as unknown as {
        browserSessions: Map<string, BrowserRecordingSession>;
      }
    ).browserSessions.get(taskId)!;
    // A finished recording, as left behind by addFrame.
    Object.assign(session, {
      muxer: { finalize() {}, target: { buffer: new ArrayBuffer(4) } },
    });
    const store = { commit: vi.fn() };
    const errors: string[] = [];
    manager.subscribeRecordingError(`${taskId}-call`, (error) => errors.push(error));
    const stopping = manager.unregisterSession(
      taskId,
      `${taskId}-call`,
      store as never,
    );
    return { store, errors, stopping };
  }

  it("retries a rate-limited upload with backoff and keeps the recording", async () => {
    vi.useFakeTimers();
    blob.blobStore.put
      .mockRejectedValueOnce(new blob.UploadError("Upload failed (HTTP 429)", 429))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue("https://blob/recording.mp4");
    const manager = new BrowserSessionManager();
    const { store, errors, stopping } = await stopWithRecording(manager, "transient");
    await vi.advanceTimersByTimeAsync(RecordingUploadRetryDelaysMs[0] - 1);
    expect(blob.blobStore.put).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(blob.blobStore.put).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(RecordingUploadRetryDelaysMs[1]);
    await stopping;
    expect(blob.blobStore.put).toHaveBeenCalledTimes(3);
    expect(store.commit).toHaveBeenCalledExactlyOnceWith({
      filePath: "/browser-session/transient-call.mp4",
      content: "https://blob/recording.mp4",
    });
    expect(errors).toEqual([]);
    expect(host.unregisterBrowserSession).toHaveBeenCalledWith("transient");
  });

  it("reports the failure once retries are exhausted and still releases the host", async () => {
    vi.useFakeTimers();
    blob.blobStore.put.mockRejectedValue(
      new blob.UploadError("Upload failed (HTTP 429)", 429),
    );
    const manager = new BrowserSessionManager();
    const { store, errors, stopping } = await stopWithRecording(manager, "persistent");
    await vi.waitFor(() =>
      expect(host.unregisterBrowserSession).toHaveBeenCalledWith("persistent"),
    );
    await vi.runAllTimersAsync();
    await stopping;
    expect(blob.blobStore.put).toHaveBeenCalledTimes(
      RecordingUploadRetryDelaysMs.length + 1,
    );
    expect(store.commit).not.toHaveBeenCalled();
    expect(errors).toEqual(["Upload failed (HTTP 429)"]);
    // A view mounted later still learns why there is no recording.
    const late = vi.fn();
    manager.subscribeRecordingError("persistent-call", late);
    expect(late).toHaveBeenCalledWith("Upload failed (HTTP 429)");
  });

  it("does not retry a non-retryable upload failure", async () => {
    blob.blobStore.put.mockRejectedValue(
      new blob.UploadError("Upload failed (HTTP 413)", 413),
    );
    const manager = new BrowserSessionManager();
    const { errors, stopping } = await stopWithRecording(manager, "too-large");
    await stopping;
    expect(blob.blobStore.put).toHaveBeenCalledOnce();
    expect(errors).toEqual(["Upload failed (HTTP 413)"]);
  });
});
