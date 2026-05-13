export const RecordingVideoBitrate = 500_000;

export const ChromeMp4RecordingCodecs = [
  "avc1.42e01e",
  "avc1.42e01f",
  "avc1.42001f",
  "avc1.4d401f",
  "avc1.64001f",
];

export async function getSupportedRecordingVideoConfig(
  width: number,
  height: number,
): Promise<VideoEncoderConfig | undefined> {
  if (!VideoEncoder.isConfigSupported) {
    return;
  }

  for (const candidate of ChromeMp4RecordingCodecs) {
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
      // Try the next Chrome MP4-compatible codec.
    }
  }
}
