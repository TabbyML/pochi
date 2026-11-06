import { UploadError, blobStore } from "@/lib/remote-blob-store";
import { getLogger } from "@getpochi/common";
import {
  type BrowserAgentSettings,
  DefaultRecordingViewport,
  getBrowserAgentViewportSize,
} from "@getpochi/common/vscode-webui-bridge";
import { type LiveKitStore, catalog } from "@getpochi/livekit";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import * as runExclusive from "run-exclusive";
import { getSupportedRecordingVideoConfig } from "./browser-recording-codecs";
import { vscodeHost } from "./vscode";

const logger = getLogger("BrowserRecordingManager");

const frameSubscriptions = new Map<string, Set<(frame: string) => void>>();
const latestFrames = new Map<string, string>();

const WebsocketRetryInterval = 2500;

/** Backoff before each retry of a failed recording upload. */
export const RecordingUploadRetryDelaysMs = [1_000, 2_000, 4_000];

/** Why a finished browser session has no recording, keyed by tool call id. */
const recordingErrors = new Map<string, string>();
const recordingErrorSubscriptions = new Map<
  string,
  Set<(error: string) => void>
>();

function setRecordingError(toolCallId: string, error: string) {
  recordingErrors.set(toolCallId, error);
  for (const callback of recordingErrorSubscriptions.get(toolCallId) ?? []) {
    callback(error);
  }
}

function isRetryableUploadError(error: unknown) {
  if (error instanceof UploadError) {
    return error.status === 429 || error.status >= 500;
  }
  // fetch rejects with a TypeError on network failures.
  return error instanceof TypeError;
}

async function uploadRecording(data: Uint8Array) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await blobStore.put(data, "video/mp4");
    } catch (error) {
      const delay = RecordingUploadRetryDelaysMs[attempt];
      if (delay === undefined || !isRetryableUploadError(error)) throw error;
      logger.warn(
        `Browser recording upload failed, retrying in ${delay}ms`,
        error,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

type BrowserRecordingOptions = {
  viewport?: BrowserAgentSettings["managedBrowser"]["viewport"];
};

async function createRecordingImageBitmap(
  imageBitmap: ImageBitmap,
  viewport?: BrowserAgentSettings["managedBrowser"]["viewport"],
): Promise<ImageBitmap> {
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null =
    null;
  const recordingViewport = viewport
    ? getBrowserAgentViewportSize(viewport)
    : DefaultRecordingViewport;
  const width = recordingViewport.width;
  const height = recordingViewport.height;

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
  private recordingUnavailable = false;
  private stopped = false;

  // WebSocket related
  private ws: WebSocket | null = null;
  private retryTimeout: NodeJS.Timeout | undefined;

  constructor(
    readonly taskId: string,
    private readonly options: BrowserRecordingOptions,
  ) {}

  startStreaming(streamUrl: string) {
    if (this.ws || this.stopped) return;

    const connect = () => {
      if (this.stopped) return;
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.close();
        this.ws = null;
      }
      try {
        const ws = new WebSocket(streamUrl);
        this.ws = ws;
        this.ws.onclose = () => {
          this.retryTimeout = setTimeout(connect, WebsocketRetryInterval);
        };
        this.ws.onerror = (event) => {
          logger.error("Browser stream error", event);
          this.ws?.close();
        };
        this.ws.onmessage = async (event) => {
          if (this.stopped) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === "frame") {
              const frame = data.data;
              try {
                // Preview must not depend on recording codec availability.
                this.notifyFrame(frame);
                await this.addFrame(frame);
              } finally {
                // Acknowledge consumption at the renderer, not at the proxy.
                if (
                  ws.readyState === WebSocket.OPEN &&
                  typeof data.seq === "number"
                ) {
                  ws.send(JSON.stringify({ type: "ack", seq: data.seq }));
                }
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
    latestFrames.set(this.taskId, frame);
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

      const binaryString = window.atob(frame);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "image/jpeg" });
      const imageBitmap = await createImageBitmap(blob);

      const recordingImageBitmap = await createRecordingImageBitmap(
        imageBitmap,
        this.options.viewport,
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
              codec: videoConfig.codec.startsWith("vp09.") ? "vp9" : "avc",
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
    async (toolCallId: string, store: LiveKitStore) => {
      this.stopped = true;
      // Stop WebSocket
      clearTimeout(this.retryTimeout);
      if (this.ws) {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
        this.ws = null;
      }

      // addFrame and stopStreaming have separate exclusive queues. Drain every
      // accepted frame before flushing/finalizing, including codec initialization.
      await runExclusive.getPrComplete(this.addFrame, this);
      if (!this.muxer) return;

      try {
        if (this.videoEncoder?.state === "configured") {
          await this.videoEncoder.flush();
        }
        this.muxer.finalize();

        const { buffer } = this.muxer.target;
        if (buffer.byteLength > 0) {
          const uint8Array = new Uint8Array(buffer);
          const url = await uploadRecording(uint8Array);
          store.commit(
            catalog.events.writeStoreFile({
              filePath: `/browser-session/${toolCallId}.mp4`,
              content: url,
            }),
          );
        }
      } catch (e) {
        logger.error("Failed to save browser recording", e);
        setRecordingError(toolCallId, e instanceof Error ? e.message : `${e}`);
      } finally {
        this.muxer = null;
        if (this.videoEncoder?.state !== "closed") {
          this.videoEncoder?.close();
        }
        this.videoEncoder = null;
      }
    },
  );
}

export class BrowserSessionManager {
  private browserSessions = new Map<string, BrowserRecordingSession>();
  private stopping = new Map<string, Promise<void>>();

  isRegistered(taskId: string) {
    return this.browserSessions.has(taskId);
  }

  async registerSession(
    taskId: string,
    parentId: string,
    recordingOptions: BrowserRecordingOptions,
  ) {
    if (this.browserSessions.has(taskId) || this.stopping.has(taskId)) return;
    const recordingSession = new BrowserRecordingSession(
      taskId,
      recordingOptions,
    );
    this.browserSessions.set(taskId, recordingSession);
    try {
      const { streamUrl } = await vscodeHost.registerBrowserSession(
        taskId,
        parentId,
      );
      // Registration can finish after the task/view has already been closed.
      if (
        this.browserSessions.get(taskId) !== recordingSession ||
        this.stopping.has(taskId)
      )
        return;
      if (streamUrl) recordingSession.startStreaming(streamUrl);
    } catch (error) {
      if (this.browserSessions.get(taskId) === recordingSession) {
        this.browserSessions.delete(taskId);
      }
      logger.error("Failed to prepare browser session", error);
    }
  }

  subscribeFrame(taskId: string, callback: (frame: string) => void) {
    if (!frameSubscriptions.has(taskId)) {
      frameSubscriptions.set(taskId, new Set());
    }
    frameSubscriptions.get(taskId)?.add(callback);
    const frame = latestFrames.get(taskId);
    if (frame) callback(frame);
    return () => {
      const subscriptions = frameSubscriptions.get(taskId);
      subscriptions?.delete(callback);
      if (subscriptions?.size === 0) frameSubscriptions.delete(taskId);
    };
  }

  subscribeRecordingError(
    toolCallId: string,
    callback: (error: string) => void,
  ) {
    if (!recordingErrorSubscriptions.has(toolCallId)) {
      recordingErrorSubscriptions.set(toolCallId, new Set());
    }
    recordingErrorSubscriptions.get(toolCallId)?.add(callback);
    const error = recordingErrors.get(toolCallId);
    if (error) callback(error);
    return () => {
      const subscriptions = recordingErrorSubscriptions.get(toolCallId);
      subscriptions?.delete(callback);
      if (subscriptions?.size === 0) {
        recordingErrorSubscriptions.delete(toolCallId);
      }
    };
  }

  async unregisterSession(
    taskId: string,
    toolCallId: string,
    store: LiveKitStore,
  ) {
    const pending = this.stopping.get(taskId);
    if (pending) return pending;
    const recordingSession = this.browserSessions.get(taskId);
    this.browserSessions.delete(taskId);
    latestFrames.delete(taskId);
    // Closing the host browser does not depend on encoding or uploading its last frames.
    const stopping = Promise.all([
      recordingSession?.stopStreaming(toolCallId, store).catch((error) => {
        logger.error("Failed to stop browser recording", error);
      }),
      vscodeHost.unregisterBrowserSession(taskId).catch((error) => {
        logger.error("Failed to release browser session", error);
      }),
    ]).then(() => {
      this.stopping.delete(taskId);
    });
    this.stopping.set(taskId, stopping);
    return stopping;
  }
}

export const browserSessionManager = new BrowserSessionManager();
