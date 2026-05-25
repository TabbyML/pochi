import { blobStore } from "@/lib/remote-blob-store";
import { getLogger } from "@getpochi/common";
import {
  type BrowserAgentRecordingSize,
  type BrowserAgentSettings,
  parseBrowserAgentRecordingSize,
} from "@getpochi/common/vscode-webui-bridge";
import { catalog } from "@getpochi/livekit";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import * as runExclusive from "run-exclusive";
import { getSupportedRecordingVideoConfig } from "./browser-recording-codecs";
import type { useDefaultStore } from "./use-default-store";
import { vscodeHost } from "./vscode";

const logger = getLogger("BrowserRecordingManager");

const frameSubscriptions = new Map<string, Set<(frame: string) => void>>();

const WhiteScreenCheckInterval = 500;
const WebsocketRetryInterval = 2500;
type BrowserRecordingOptions = BrowserAgentSettings["recording"];

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

async function createRecordingImageBitmap(
  imageBitmap: ImageBitmap,
  recordingSize: BrowserAgentRecordingSize,
): Promise<ImageBitmap> {
  const { width, height } = parseBrowserAgentRecordingSize(recordingSize);
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null =
    null;

  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
  } else {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext("2d");
  }

  if (!ctx) {
    throw new Error("Failed to create browser recording canvas");
  }

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const scale = Math.min(
    width / imageBitmap.width,
    height / imageBitmap.height,
  );
  const drawWidth = Math.round(imageBitmap.width * scale);
  const drawHeight = Math.round(imageBitmap.height * scale);
  const drawX = Math.floor((width - drawWidth) / 2);
  const drawY = Math.floor((height - drawHeight) / 2);
  ctx.drawImage(imageBitmap, drawX, drawY, drawWidth, drawHeight);

  if (
    typeof OffscreenCanvas !== "undefined" &&
    canvas instanceof OffscreenCanvas
  ) {
    return canvas.transferToImageBitmap();
  }

  return createImageBitmap(canvas);
}

export class BrowserRecordingSession {
  private muxer: Muxer<ArrayBufferTarget> | null = null;
  private videoEncoder: VideoEncoder | null = null;
  private startTime = 0;
  private lastWhiteScreenCheckTime = 0;
  private recordingUnavailable = false;

  // WebSocket related
  private ws: WebSocket | null = null;
  private retryTimeout: NodeJS.Timeout | undefined;

  constructor(
    readonly taskId: string,
    private readonly options: BrowserRecordingOptions,
  ) {}

  startStreaming(streamUrl: string) {
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
              if (!this.options.recordingEnabled) {
                this.notifyFrame(frame);
                return;
              }
              void this.addFrame(frame);
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
      if (this.recordingUnavailable) {
        return;
      }

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
      const imageBitmap = await createImageBitmap(blob);

      if (!this.muxer) {
        if (isWhiteScreen(imageBitmap)) {
          imageBitmap.close();
          return;
        }
      }

      const recordingImageBitmap = await createRecordingImageBitmap(
        imageBitmap,
        this.options.recordingSize,
      );
      imageBitmap.close();

      if (!this.muxer) {
        try {
          const { width, height } = recordingImageBitmap;
          const videoConfig = await getSupportedRecordingVideoConfig(
            width,
            height,
          );
          if (!videoConfig) {
            this.recordingUnavailable = true;
            logger.error("No supported browser recording codec");
            recordingImageBitmap.close();
            return;
          }

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
          encoder.configure(videoConfig);

          this.muxer = muxer;
          this.videoEncoder = encoder;
          this.startTime = performance.now();
        } catch (e) {
          this.recordingUnavailable = true;
          logger.error("Failed to initialize recording", e);
        }
      }

      if (this.videoEncoder?.state === "configured") {
        const timestamp = (performance.now() - this.startTime) * 1000;
        const videoFrame = new VideoFrame(recordingImageBitmap, { timestamp });
        this.videoEncoder.encode(videoFrame);
        videoFrame.close();
      }
      recordingImageBitmap.close();
    } catch (err) {
      logger.error("Failed to process frame", err);
    }
  });

  stopStreaming = runExclusive.buildMethod(
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
            store.commit(
              catalog.events.writeStoreFile({
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
  private browserSessions = new Map<string, BrowserRecordingSession>();

  isRegistered(taskId: string) {
    return this.browserSessions.has(taskId);
  }

  async registerSession(
    taskId: string,
    parentId: string,
    recordingOptions: BrowserRecordingOptions,
  ) {
    const recordingSession = new BrowserRecordingSession(
      taskId,
      recordingOptions,
    );
    this.browserSessions.set(taskId, recordingSession);
    const { streamUrl } = await vscodeHost.registerBrowserSession(
      taskId,
      parentId,
    );
    if (streamUrl) {
      recordingSession.startStreaming(streamUrl);
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
    const recordingSession = this.browserSessions.get(taskId);
    if (recordingSession) {
      await recordingSession.stopStreaming(toolCallId, store);
      this.browserSessions.delete(taskId);
    }
    frameSubscriptions.delete(taskId);
    vscodeHost.unregisterBrowserSession(taskId);
  }
}

export const browserSessionManager = new BrowserSessionManager();
