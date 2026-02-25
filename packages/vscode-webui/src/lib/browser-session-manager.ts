import { blobStore } from "@/lib/remote-blob-store";
import { getLogger } from "@getpochi/common";
import { decodeStoreId } from "@getpochi/common/store-id-utils";
import { catalog } from "@getpochi/livekit";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import * as runExclusive from "run-exclusive";
import type { useDefaultStore } from "./use-default-store";
import { vscodeHost } from "./vscode";

const logger = getLogger("BrowserRecordingManager");

const frameSubscriptions = new Map<string, Set<(frame: string) => void>>();

const WhiteScreenCheckInterval = 500;
const WebsocketRetryInterval = 2500;

function isWhiteScreen(imageBitmap: ImageBitmap): boolean {
  const width = 32;
  const height = 32;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null =
    null;

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext("2d");
  }

  if (!ctx) return false;

  ctx.drawImage(imageBitmap, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Check if all pixels are white
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r < 250 || g < 250 || b < 250) {
      return false;
    }
  }

  return true;
}

export class BrowserRecordingSession {
  private muxer: Muxer<ArrayBufferTarget> | null = null;
  private videoEncoder: VideoEncoder | null = null;
  private startTime = 0;
  private lastWhiteScreenCheckTime = 0;

  // WebSocket related
  private ws: WebSocket | null = null;
  private retryTimeout: NodeJS.Timeout | undefined;

  constructor(readonly taskId: string) {}

  startRecording(streamUrl: string) {
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
          this.retryTimeout = setTimeout(connect, WebsocketRetryInterval);
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
              // Only notify subscribers after recording has started (passed white screen check)
              if (this.muxer) {
                this.notifyFrame(frame);
              }
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
        this.retryTimeout = setTimeout(connect, WebsocketRetryInterval);
      }
    };

    connect();
  }

  private notifyFrame(frame: string) {
    const subscriptions = frameSubscriptions.get(this.taskId);
    if (subscriptions) {
      for (const callback of subscriptions) {
        callback(frame);
      }
    }
  }

  private addFrame = runExclusive.buildMethod(async (frame: string) => {
    try {
      if (!this.muxer) {
        const now = Date.now();
        if (now - this.lastWhiteScreenCheckTime < WhiteScreenCheckInterval) {
          return;
        }
        this.lastWhiteScreenCheckTime = now;
      }

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
        if (isWhiteScreen(imageBitmap)) {
          imageBitmap.close();
          return;
        }

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
            firstTimestampBehavior: "offset",
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

  stopRecording = runExclusive.buildMethod(
    async (toolCallId: string, store: ReturnType<typeof useDefaultStore>) => {
      // Stop WebSocket
      clearTimeout(this.retryTimeout);
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
        this.ws = null;
      }

      if (!this.muxer) return;

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
            const { taskId } = decodeStoreId(store.storeId);
            store.commit(
              catalog.events.writeTaskFile({
                taskId,
                filePath: `/browser-session/${toolCallId}.mp4`,
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
    },
  );
}

export class BrowserSessionManager {
  private recordingSessions = new Map<string, BrowserRecordingSession>();

  isRegistered(taskId: string) {
    return this.recordingSessions.has(taskId);
  }

  async registerSession(taskId: string, parentId: string) {
    const recordingSession = new BrowserRecordingSession(taskId);
    this.recordingSessions.set(taskId, recordingSession);
    const { streamUrl } = await vscodeHost.registerBrowserSession(
      taskId,
      parentId,
    );
    if (streamUrl) {
      recordingSession.startRecording(streamUrl);
    }
  }

  subscribeFrame(taskId: string, callback: (frame: string) => void) {
    if (!frameSubscriptions.has(taskId)) {
      frameSubscriptions.set(taskId, new Set());
    }
    frameSubscriptions.get(taskId)?.add(callback);
    return () => {
      frameSubscriptions.get(taskId)?.delete(callback);
    };
  }

  async unregisterSession(
    taskId: string,
    toolCallId: string,
    store: ReturnType<typeof useDefaultStore>,
  ) {
    const recordingSession = this.recordingSessions.get(taskId);
    if (recordingSession) {
      await recordingSession.stopRecording(toolCallId, store);
      this.recordingSessions.delete(taskId);
    }
    frameSubscriptions.delete(taskId);
    vscodeHost.unregisterBrowserSession(taskId);
  }
}

export const browserSessionManager = new BrowserSessionManager();
