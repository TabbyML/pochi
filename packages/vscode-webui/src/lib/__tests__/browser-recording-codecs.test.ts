import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupportedRecordingVideoConfig } from "../browser-recording-codecs";

afterEach(() => vi.unstubAllGlobals());

describe("browser recording codecs", () => {
  it("prefers supported H.264 for MP4", async () => {
    const isConfigSupported = vi.fn(async (config: VideoEncoderConfig) => ({
      supported: config.codec === "avc1.42e01f",
      config,
    }));
    vi.stubGlobal("VideoEncoder", { isConfigSupported });
    expect(await getSupportedRecordingVideoConfig(1280, 720)).toMatchObject({
      codec: "avc1.42e01f",
      width: 1280,
      height: 720,
    });
    expect(isConfigSupported).toHaveBeenCalledTimes(2);
  });

  it("falls back to VP9 when H.264 encoders are unavailable", async () => {
    vi.stubGlobal("VideoEncoder", {
      isConfigSupported: vi.fn(async (config: VideoEncoderConfig) => ({
        supported: config.codec.startsWith("vp09."),
        config,
      })),
    });
    expect(await getSupportedRecordingVideoConfig(1280, 720)).toMatchObject({
      codec: "vp09.00.10.08",
    });
  });

  it("handles a renderer without WebCodecs", async () => {
    vi.stubGlobal("VideoEncoder", undefined);
    expect(await getSupportedRecordingVideoConfig(1280, 720)).toBeUndefined();
  });

  it("tries remaining codecs after a capability check rejects", async () => {
    vi.stubGlobal("VideoEncoder", {
      isConfigSupported: vi.fn(async (config: VideoEncoderConfig) => {
        if (config.codec.startsWith("avc1.")) throw new Error("Unsupported");
        return { supported: true, config };
      }),
    });
    expect(await getSupportedRecordingVideoConfig(1280, 720)).toMatchObject({
      codec: "vp09.00.10.08",
    });
  });
});
