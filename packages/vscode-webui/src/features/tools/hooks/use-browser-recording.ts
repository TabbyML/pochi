import { blobStore } from "@/lib/remote-blob-store";
import { useDefaultStore } from "@/lib/use-default-store";
import { getLogger } from "@getpochi/common";
import { catalog } from "@getpochi/livekit";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { useEffect, useRef } from "react";

const logger = getLogger("useBrowserRecording");

export function useBrowserRecording(
  taskId: string,
  frame: string | null,
  isExecuting: boolean,
) {
  const store = useDefaultStore();
  const muxerRef = useRef<Muxer<ArrayBufferTarget> | null>(null);
  const videoEncoderRef = useRef<VideoEncoder | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    const processFrame = async () => {
      if (!frame) return;
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
    };

    const stopRecording = async () => {
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
              taskId,
              filePath: `/browser-recording/${taskId}.mp4`,
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
    };

    if (isExecuting && frame) {
      processFrame();
    } else if (!isExecuting && muxerRef.current) {
      stopRecording();
    }
  }, [frame, isExecuting, taskId, store]);
}
