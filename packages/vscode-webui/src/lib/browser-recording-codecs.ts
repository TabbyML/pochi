export const RecordingVideoBitrate = 500_000;

export const Mp4RecordingCodecs = [
  "avc1.42e01e",
  "avc1.42e01f",
  "avc1.42001f",
  "avc1.4d401f",
  "avc1.64001f",
  // Some VS Code/Electron builds do not provide an H.264 encoder.
  "vp09.00.10.08",
];

export async function getSupportedRecordingVideoConfig(
  width: number,
  height: number,
): Promise<VideoEncoderConfig | undefined> {
  if (typeof VideoEncoder === "undefined" || !VideoEncoder.isConfigSupported) {
    return;
  }

  for (const candidate of Mp4RecordingCodecs) {
    const encoderConfig: VideoEncoderConfig = {
      codec: candidate,
      width,
      height,
      bitrate: RecordingVideoBitrate,
      latencyMode: "quality",
    };

    try {
      const support = await VideoEncoder.isConfigSupported(encoderConfig);
      if (support.supported) {
        return support.config ?? encoderConfig;
      }
    } catch {
      // Try the next MP4-compatible codec.
    }
  }
}
