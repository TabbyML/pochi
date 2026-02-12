import { blobStore } from "@/lib/remote-blob-store";
import { getLogger } from "@getpochi/common";
import { catalog } from "@getpochi/livekit";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import * as runExclusive from "run-exclusive";
import type { useDefaultStore } from "./use-default-store";

const logger = getLogger("BrowserRecordingManager");

class BrowserRecordingSession {
  private muxer: Muxer<ArrayBufferTarget> | null = null;
  private videoEncoder: VideoEncoder | null = null;
  private startTime = 0;
  private runSerialized = runExclusive.build(
    async <T>(task: () => Promise<T>) => task(),
  );

  // WebSocket related
  private ws: WebSocket | null = null;
  private retryTimeout: NodeJS.Timeout | undefined;
  private retryInterval = 2500;
  private onFrameCallbacks: Set<(frame: string) => void> = new Set();

  constructor(
    private readonly toolCallId: string,
    private readonly parentTaskId: string,
    private readonly store: ReturnType<typeof useDefaultStore>,
  ) {}

  start(streamUrl: string) {
    if (this.ws) return; // Already started

    const connect = () => {
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.close();
        this.ws = null;
      }
      try {
        this.ws = new WebSocket(streamUrl);
        this.ws.onclose = () => {
          this.retryTimeout = setTimeout(connect, this.retryInterval);
        };
        this.ws.onerror = (event) => {
          logger.error("Browser stream error", event);
          this.ws?.close();
        };
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "frame") {
              const frame = data.data;
              this.addFrame(frame);
              this.notifyFrame(frame);
            } else if (data.type === "error") {
              logger.error("Browser message error", event);
              this.ws?.close();
            }
          } catch (e) {
            logger.error("Failed to parse browser frame", e);
          }
        };
      } catch (e) {
        logger.error("Failed to connect to browser stream", e);
        this.retryTimeout = setTimeout(connect, this.retryInterval);
      }
    };

    connect();
  }

  subscribe(callback: (frame: string) => void) {
    this.onFrameCallbacks.add(callback);
    return () => {
      this.onFrameCallbacks.delete(callback);
    };
  }

  private notifyFrame(frame: string) {
    for (const cb of this.onFrameCallbacks) {
      cb(frame);
    }
  }

  addFrame(frame: string) {
    return this.runSerialized(async () => {
      try {
        const binaryString = window.atob(frame);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "image/jpeg" });
        const imageBitmap = await createImageBitmap(blob, {
          resizeHeight: 480,
          resizeQuality: "high",
        });

        if (!this.muxer) {
          try {
            const { width, height } = imageBitmap;
            const muxer = new Muxer({
              target: new ArrayBufferTarget(),
              video: {
                codec: "avc",
                width,
                height,
              },
              fastStart: "in-memory",
            });
            const encoder = new VideoEncoder({
              output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
              error: (e) => logger.error("VideoEncoder error", e),
            });
            encoder.configure({
              codec: "avc1.4d001f",
              width,
              height,
              bitrate: 500_000,
              latencyMode: "quality",
            });

            this.muxer = muxer;
            this.videoEncoder = encoder;
            this.startTime = performance.now();
          } catch (e) {
            logger.error("Failed to initialize recording", e);
          }
        }

        if (this.videoEncoder?.state === "configured") {
          const timestamp = (performance.now() - this.startTime) * 1000;
          const videoFrame = new VideoFrame(imageBitmap, { timestamp });
          this.videoEncoder.encode(videoFrame);
          videoFrame.close();
        }
        imageBitmap.close();
      } catch (err) {
        logger.error("Failed to process frame", err);
      }
    });
  }

  finish(): Promise<string | null> {
    // Stop WebSocket
    clearTimeout(this.retryTimeout);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }

    return this.runSerialized(async () => {
      if (!this.muxer) return null;

      try {
        if (this.videoEncoder?.state === "configured") {
          await this.videoEncoder.flush();
        }
        this.muxer.finalize();

        const { buffer } = this.muxer.target;
        if (buffer.byteLength > 0) {
          const uint8Array = new Uint8Array(buffer);
          const url = await blobStore.put(uint8Array, "video/mp4");
          if (url) {
            this.store.commit(
              catalog.events.writeTaskFile({
                taskId: this.parentTaskId,
                filePath: `/browser-session/${this.toolCallId}.mp4`,
                content: url,
              }),
            );
          }
        }
      } catch (e) {
        logger.error("Failed to stop recording", e);
      } finally {
        this.muxer = null;
        this.videoEncoder = null;
      }
      return null;
    });
  }
}

export class BrowserRecordingManager {
  private sessions = new Map<string, BrowserRecordingSession>();

  startRecording(
    taskId: string,
    parentTaskId: string,
    store: ReturnType<typeof useDefaultStore>,
    streamUrl: string,
    onFrame?: (frame: string) => void,
  ) {
    let session = this.sessions.get(taskId);
    if (!session) {
      session = new BrowserRecordingSession(taskId, parentTaskId, store);
      this.sessions.set(taskId, session);
      session.start(streamUrl);
    }

    if (onFrame) {
      return session.subscribe(onFrame);
    }
    return () => {};
  }

  async stopRecording(taskId: string): Promise<string | null> {
    const session = this.sessions.get(taskId);
    if (!session) return null;

    this.sessions.delete(taskId);
    return session.finish();
  }
}

export const browserRecordingManager = new BrowserRecordingManager();
