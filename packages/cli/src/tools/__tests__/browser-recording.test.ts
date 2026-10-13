import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolCallOptions } from "../../types";

const mocks = vi.hoisted(() => ({
  handleFrame: vi.fn(),
  stop: vi.fn(),
  socket: undefined as EventTarget | undefined,
}));
vi.mock("../../lib/ffmpeg-mjpeg-to-mp4", () => ({
  isMjpegToMp4ConverterAvailable: async () => true,
  startMjpegToMp4Converter: () => ({
    handleFrame: mocks.handleFrame,
    stop: mocks.stop,
  }),
}));
vi.mock("reconnecting-websocket", () => ({
  default: class extends EventTarget {
    constructor() {
      super();
      mocks.socket = this;
    }
    close() {}
  },
}));
vi.mock("node:fs/promises", () => ({
  default: {
    realpath: async () => "/tmp",
    readFile: async () => new Uint8Array(),
    unlink: async () => {},
  },
}));
import { newTask } from "../new-task";

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("official browser stream recording", () => {
  it("converts milliseconds, serializes writes and flushes before stopping", async () => {
    const events: string[] = [];
    let active = 0;
    let maxActive = 0;
    mocks.handleFrame.mockImplementation(async (frame) => {
      maxActive = Math.max(maxActive, ++active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push(frame.data);
      active--;
    });
    mocks.stop.mockImplementation(async () => {
      events.push("stop");
    });
    const send = (timestamp: unknown, data: string) =>
      mocks.socket!.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "frame",
            data,
            metadata: { timestamp },
          }),
        }),
      );
    const execute = newTask({
      customAgents: [{ name: "browser" }],
      browserSessionStore: {
        registerBrowserSession: async () => ({ streamUrl: "ws://fixture" }),
      },
      createSubTaskRunner: () => ({
        run: async () => {
          send(1_790_000_000_000, "one");
          send(1_790_000_000_100, "two");
          send(0, "fallback");
        },
        state: { messages: [] },
      }),
      blobStore: { put: async () => "video" },
      fileSystem: { writeFile: async () => {} },
    } as unknown as ToolCallOptions);
    vi.spyOn(Date, "now").mockReturnValue(1_790_000_000_200);
    await execute(
      {
        description: "Browser",
        prompt: "Test",
        agentType: "browser",
        background: false,
      },
      { toolCallId: "call" } as Parameters<typeof execute>[1],
    );
    expect(mocks.handleFrame.mock.calls.map(([frame]) => frame.ts)).toEqual([
      1_790_000_000, 1_790_000_000.1, 1_790_000_000.2,
    ]);
    expect(maxActive).toBe(1);
    expect(events).toEqual(["one", "two", "fallback", "stop"]);
  });
});
