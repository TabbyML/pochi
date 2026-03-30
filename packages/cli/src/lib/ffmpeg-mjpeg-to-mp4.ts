import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import { getLogger } from "@getpochi/common";
import ffmpeg from "fluent-ffmpeg";
import * as runExclusive from "run-exclusive";

const logger = getLogger("MjpegToMp4");

export function setFfmpegPath(path: string) {
  ffmpeg.setFfmpegPath(path);
}

export async function isMjpegToMp4ConverterAvailable(): Promise<boolean> {
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

  // H.264 encode settings
  preset?: string; // "veryfast"
  crf?: number; // 23
  videoBitrate?: string; // e.g. "2500k"

  // Video dimensions
  width?: number; // 1280
  height?: number; // 720
};

export function startMjpegToMp4Converter(
  outputPath: string,
  opts: Options = {},
): Converter {
  if (process.env.POCHI_FFMPEG_USE_PIPE) {
    return pipeBasedConverterImpl(outputPath, opts);
  }
  return diskBasedConverterImpl(outputPath, opts);
}

function pipeBasedConverterImpl(
  outputPath: string,
  opts: Options & {
    // Nominal frame rate used for timing when we repeat frames.
    nominalFps?: number;
  } = {},
): Converter {
  const {
    maxGapMs = 10_000,
    finalFrameDurationMs = 1_000,
    nominalFps = 30,
    preset = "veryfast",
    crf = 23,
    videoBitrate,
    width = 854,
    height = 480,
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
      "-pix_fmt yuv420p",
      "-movflags +faststart",
      `-preset ${preset}`,
      `-crf ${crf}`,
      "-an", // no audio
      ...(videoBitrate ? [`-b:v ${videoBitrate}`] : []),
    ])
    .videoCodec("libx264")
    .fps(nominalFps)
    .format("mp4")
    .videoFilter(
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    )
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

    if (prevTs !== null && pendingJpeg) {
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

function diskBasedConverterImpl(outputPath: string, opts: Options = {}) {
  const {
    maxGapMs = 10_000,
    finalFrameDurationMs = 1_000,
    preset = "veryfast",
    crf = 23,
    videoBitrate,
    width = 854,
    height = 480,
  } = opts;

  let workDir: string | undefined;
  const frames: { filename: string; duration?: number }[] = [];
  let prevTs: number | null = null;
  let lastFrameFilename: string | null = null;

  async function handleFrame(frame: TimestampedFrame) {
    if (!workDir) {
      workDir = await fs.mkdtemp(path.join(os.tmpdir(), "pochi-mjpeg2mp4-"));
    }
    const idx = frames.length;
    const filename = path.join(
      workDir,
      `frame_${String(idx).padStart(6, "0")}.jpg`,
    );
    await fs.writeFile(filename, decodeBase64JpegToBuffer(frame.data));
    logger.debug(`Saved frame ${idx}: ${frame.ts}`);

    if (prevTs !== null) {
      // Clamp the inter-frame duration to maxGapMs
      let dt = (frame.ts - prevTs) * 1000;
      dt = Math.max(dt, 1); // at least 1ms
      dt = Math.min(dt, maxGapMs);
      const duration = dt / 1000;
      if (lastFrameFilename) {
        frames[frames.length - 1].duration = duration;
      }
    }
    frames.push({ filename });
    prevTs = frame.ts;
    lastFrameFilename = filename;
  }

  async function stop() {
    if (!workDir) {
      logger.debug("Work dir not created.");
      return;
    }

    if (frames.length === 0) {
      logger.debug("No frames to process.");
      return;
    }

    // For final frame: use configured duration (default 1 second)
    const lastIdx = frames.length - 1;
    const finalDurSec = Math.max(0.001, finalFrameDurationMs / 1000);

    if (frames[lastIdx].duration === undefined) {
      frames[lastIdx].duration = finalDurSec;
    }

    // Write ffconcat file
    const concatFilePath = path.join(workDir, "frames.ffconcat");
    let concatTxt = "ffconcat version 1.0\n";
    for (const f of frames) {
      concatTxt += `file '${f.filename}'\n`;
      if ("duration" in f && f.duration) {
        concatTxt += `duration ${f.duration}\n`;
      }
    }
    // Re-add last frame for concat's last frame duration semantics
    concatTxt += `file '${frames[lastIdx].filename}'\n`;
    await fs.writeFile(concatFilePath, concatTxt);

    // Run ffmpeg on concat
    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg()
        .input(concatFilePath)
        .inputOptions(["-safe 0", "-f concat"])
        .outputOptions([
          "-pix_fmt yuv420p",
          "-movflags +faststart",
          `-preset ${preset}`,
          `-crf ${crf}`,
          "-an",
          ...(videoBitrate ? [`-b:v ${videoBitrate}`] : []),
        ])
        .videoCodec("libx264")
        .format("mp4")
        .videoFilter(
          `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
        )
        .output(outputPath)
        .on("start", (cmd) => logger.debug("[ffmpeg] start:", cmd))
        .on("stderr", (line) => logger.debug("[ffmpeg] stderr:", line))
        .on("error", (err) => {
          logger.debug("[ffmpeg] error:", err);
          reject(err);
        })
        .on("end", () => {
          logger.debug("[ffmpeg] end");
          resolve();
        });
      command.run();
    });

    // Cleanup tempdir
    try {
      await fs.rm(workDir, { recursive: true, force: true });
    } catch (err) {
      logger.debug(`Failed to remove tmp dir ${workDir}:`, err);
    }
  }

  return { handleFrame, stop };
}

function decodeBase64JpegToBuffer(b64OrDataUrl: string): Buffer {
  // accept raw base64 OR data URL
  const cleaned = b64OrDataUrl.replace(/^data:image\/jpeg;base64,/, "");
  return Buffer.from(cleaned, "base64");
}
