import { blobStore } from "@/lib/remote-blob-store";
import { useBrowserSession } from "@/lib/use-browser-session";
import { getLogger } from "@getpochi/common";
import { Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrayBufferTarget, Muxer } from "webm-muxer";
import type { NewTaskToolViewProps } from ".";
import { useWebsocketFrame } from "../../hooks/use-websocket-frame";
import { SubAgentView } from "./sub-agent-view";

const logger = getLogger("BrowserView");

export function BrowserView(props: NewTaskToolViewProps) {
  const { taskSource, uid, tool, toolCallStatusRegistryRef, isExecuting } =
    props;
  const { t } = useTranslation();
  const description = tool.input?.description;
  const browserSession = useBrowserSession(uid || "");
  const streamUrl = browserSession?.streamUrl;
  const frame = useWebsocketFrame(streamUrl);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

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
        const imageBitmap = await createImageBitmap(blob);

        if (!muxerRef.current) {
          try {
            const { width, height } = imageBitmap;
            const muxer = new Muxer({
              target: new ArrayBufferTarget(),
              video: {
                codec: "V_VP8",
                width,
                height,
              },
            });
            const encoder = new VideoEncoder({
              output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
              error: (e) => logger.error("VideoEncoder error", e),
            });
            encoder.configure({
              codec: "vp8",
              width,
              height,
              bitrate: 1_000_000,
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
          const url = await blobStore.put(uint8Array, "video/webm");
          setVideoUrl(url);
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
  }, [frame, isExecuting]);

  return (
    <SubAgentView
      icon={<Globe className="size-3.5" />}
      title={description}
      taskSource={taskSource}
      toolCallStatusRegistryRef={toolCallStatusRegistryRef}
    >
      <div className="flex flex-col gap-2 bg-black">
        <div className="relative aspect-video max-h-[20vh] w-full">
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              className="h-full w-full object-contain"
            >
              <track kind="captions" />
            </video>
          ) : frame ? (
            <img
              src={`data:image/jpeg;base64,${frame}`}
              alt="Browser view"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
              {t("browserView.noFrameAvailable")}
            </div>
          )}
        </div>
      </div>
    </SubAgentView>
  );
}
