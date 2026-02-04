import { blobStore } from "@/lib/remote-blob-store";
import { useDefaultStore } from "@/lib/use-default-store";
import { getLogger } from "@getpochi/common";
import { catalog } from "@getpochi/livekit";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { useEffect, useMemo, useRef, useState } from "react";
import * as runExclusive from "run-exclusive";

const logger = getLogger("useBrowserFrame");

export function useBrowserFrame(options: {
  toolCallId: string;
  parentTaskId: string;
  completed: boolean;
  streamUrl?: string;
}) {
  const { toolCallId, parentTaskId, completed, streamUrl } = options;
  const [frame, setFrame] = useState<string | null>(null);
  const store = useDefaultStore();
  const muxerRef = useRef<Muxer<ArrayBufferTarget> | null>(null);
  const videoEncoderRef = useRef<VideoEncoder | null>(null);
  const startTimeRef = useRef<number>(0);

  // WebSocket connection to get frames
  useEffect(() => {
    if (!streamUrl) return;

    let ws: WebSocket | null = null;
    let retryTimeout: NodeJS.Timeout;
    const retryInterval = 2500;

    const connect = () => {
      if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
      }
      try {
        ws = new WebSocket(streamUrl);
        ws.onclose = () => {
          // Always retry
          retryTimeout = setTimeout(connect, retryInterval);
        };
        ws.onerror = (event) => {
          logger.error("Browser stream error", event);
          // Force close to trigger onclose and retry
          ws?.close();
        };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "frame") {
              setFrame(data.data); // base64 image
            } else if (data.type === "error") {
              logger.error("Browser message error", event);
              // Force close to trigger onclose and retry
              ws?.close();
            }
          } catch (e) {
            logger.error("Failed to parse browser frame", e);
          }
        };
      } catch (e) {
        logger.error("Failed to connect to browser stream", e);
        retryTimeout = setTimeout(connect, retryInterval);
      }
    };

    connect();

    return () => {
      clearTimeout(retryTimeout);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
        ws = null;
      }
    };
  }, [streamUrl]);

  const recordFrame = useMemo(() => {
    return runExclusive.build(async (frame: string) => {
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
        if (!muxerRef.current) {
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

            muxerRef.current = muxer;
            videoEncoderRef.current = encoder;
            startTimeRef.current = performance.now();
          } catch (e) {
            logger.error("Failed to initialize recording", e);
          }
        }
        if (videoEncoderRef.current?.state === "configured") {
          const timestamp = (performance.now() - startTimeRef.current) * 1000;
          const videoFrame = new VideoFrame(imageBitmap, { timestamp });
          videoEncoderRef.current.encode(videoFrame);
          videoFrame.close();
        }
        imageBitmap.close();
      } catch (err) {
        logger.error("Failed to process frame", err);
      }
    });
  }, []);

  const stopRecording = useMemo(() => {
    return runExclusive.build(async () => {
      if (!muxerRef.current) return;

      try {
        if (videoEncoderRef.current?.state === "configured") {
          await videoEncoderRef.current.flush();
        }
        muxerRef.current?.finalize();

        if (!muxerRef.current) return;
        const { buffer } = muxerRef.current.target;
        if (buffer.byteLength > 0) {
          const uint8Array = new Uint8Array(buffer);
          const url = await blobStore.put(uint8Array, "video/mp4");

          store.commit(
            catalog.events.writeTaskFile({
              taskId: parentTaskId,
              filePath: `/browser-session/${toolCallId}.mp4`,
              content: url,
            }),
          );
        }
      } catch (e) {
        logger.error("Failed to stop recording", e);
      } finally {
        muxerRef.current = null;
        videoEncoderRef.current = null;
      }
    });
  }, [parentTaskId, toolCallId, store]);

  // Recording logic
  useEffect(() => {
    if (frame && !completed) {
      recordFrame(frame);
    }
    if (completed) {
      stopRecording();
    }
  }, [frame, completed, stopRecording, recordFrame]);

  return frame;
}
