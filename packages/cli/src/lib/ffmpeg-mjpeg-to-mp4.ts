import { PassThrough } from "node:stream";
import { getLogger } from "@getpochi/common";
import ffmpeg from "fluent-ffmpeg";
import * as runExclusive from "run-exclusive";

const logger = getLogger("MjpegToMp4");

export function setFfmpegPath(path: string) {
  ffmpeg.setFfmpegPath(path);
}

export async function isMjpegToMp4ConverterAvaiable(): Promise<boolean> {
  const checkCodecs = new Promise<boolean>((resolve) => {
    ffmpeg.getAvailableCodecs((err, codecs) => {
      if (err) {
        logger.debug("Failed to get available codecs.", err.message);
        return resolve(false);
      }
      const hasLibx264 = "libx264" in codecs && codecs.libx264.canEncode;
      if (!hasLibx264) {
        logger.debug("libx264 codec not available.");
      }
      resolve(hasLibx264);
    });
  });

  const checkFormats = new Promise<boolean>((resolve) => {
    ffmpeg.getAvailableFormats((err, formats) => {
      if (err) {
        logger.debug("Failed to get available formats.", err.message);
        return resolve(false);
      }
      const hasMjpeg = "mjpeg" in formats && formats.mjpeg.canDemux;
      if (!hasMjpeg) {
        logger.debug("mjpeg format not available.");
      }
      const hasMp4 = "mp4" in formats && formats.mp4.canMux;
      if (!hasMp4) {
        logger.debug("mp4 format not available.");
      }
      resolve(hasMjpeg && hasMp4);
    });
  });

  const [codecsOk, formatsOk] = await Promise.all([checkCodecs, checkFormats]);
  return codecsOk && formatsOk;
}

export type TimestampedFrame = {
  data: string; // base64 jpeg
  ts: number; // seconds
};

export type Converter = {
  handleFrame: (frame: TimestampedFrame) => void;
  stop: () => Promise<void>;
};

type Options = {
  // MJPEG frames timestamp settings
  maxGapMs?: number;
  finalFrameDurationMs?: number;

  // Nominal frame rate used for timing when we repeat frames.
  nominalFps?: number;

  // H.264 encode settings
  preset?: string; // "veryfast"
  crf?: number; // 23
  videoBitrate?: string; // e.g. "2500k"

  // Video dimensions
  width?: number;
  height?: number;
};

export function startMjpegToMp4Converter(
  outputPath: string,
  opts: Options = {},
): Converter {
  const {
    maxGapMs = 10_000,
    finalFrameDurationMs = 1_000,
    nominalFps = 30,
    preset = "veryfast",
    crf = 23,
    videoBitrate,
    width,
    height,
  } = opts;

  // Feed ffmpeg a stream of JPEG images (MJPEG) via stdin.
  const mjpegStream = new PassThrough({ highWaterMark: 1024 * 1024 });

  // Track timing (seconds)
  let prevTs: number | null = null;

  // Hold previous frame until next frame arrives (so we know its duration)
  let pendingJpeg: Buffer | null = null;

  // Create the ffmpeg command
  const command = ffmpeg()
    .input(mjpegStream)
    .inputFormat("mjpeg")
    .inputOptions([`-r ${nominalFps}`])
    .outputOptions([
      "-vsync vfr",
      "-pix_fmt yuv420p",
      "-movflags +faststart",
      `-preset ${preset}`,
      `-crf ${crf}`,
      ...(videoBitrate ? [`-b:v ${videoBitrate}`] : []),
      ...(width && height ? [`-vf scale=${width}:${height}`] : []),
    ])
    .videoCodec("libx264")
    .format("mp4")
    .output(outputPath);

  // Logging
  command.on("start", (cmd) => logger.debug("[ffmpeg] start:", cmd));
  command.on("stderr", (line) => logger.debug("[ffmpeg] stderr:", line));
  command.on("error", (err) => logger.debug("[ffmpeg] error:", err));
  command.on("end", () => logger.debug("[ffmpeg] end"));

  // Spawn
  command.run();

  const writeRepeatedFrames = runExclusive.build(
    async (jpeg: Buffer, repeat: number) => {
      for (let i = 0; i < repeat; i++) {
        if (!mjpegStream.write(jpeg)) {
          await new Promise<void>((r) => mjpegStream.once("drain", r));
        }
      }
    },
  );

  function handleFrame(frame: TimestampedFrame) {
    const ts = frame.ts;
    const jpeg = decodeBase64JpegToBuffer(frame.data);

    if (prevTs && pendingJpeg) {
      // Duration for pending frame = time until current frame
      const rawDurSec = ts - prevTs;
      const durMs = Math.min(rawDurSec * 1000, maxGapMs);
      const repeat = Math.max(1, Math.round((durMs / 1000) * nominalFps));

      void writeRepeatedFrames(pendingJpeg, repeat);
    }

    // Update pending to current
    prevTs = ts;
    pendingJpeg = jpeg;
  }

  async function stop() {
    // Flush the final pending frame with a final duration
    if (pendingJpeg) {
      const repeat = Math.max(
        1,
        Math.round((finalFrameDurationMs / 1000) * nominalFps),
      );
      await writeRepeatedFrames(pendingJpeg, repeat);
      pendingJpeg = null;
    }

    // Signal EOF to ffmpeg
    mjpegStream.end();

    // Wait for ffmpeg to finish
    await new Promise<void>((resolve, reject) => {
      const done = (err?: unknown) => {
        cleanup();
        err ? reject(err) : resolve();
      };

      const cleanup = () => {
        command.removeListener("end", onEnd);
        command.removeListener("error", onError);
      };

      const onEnd = () => done();
      const onError = (err: unknown) => done(err);

      command.once("end", onEnd);
      command.once("error", onError);
    });
  }
  return { handleFrame, stop };
}

function decodeBase64JpegToBuffer(b64OrDataUrl: string): Buffer {
  // accept raw base64 OR data URL
  const cleaned = b64OrDataUrl.replace(/^data:image\/jpeg;base64,/, "");
  return Buffer.from(cleaned, "base64");
}
