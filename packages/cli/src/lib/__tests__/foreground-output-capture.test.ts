import { once } from "node:events";
import type { WriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { ForegroundOutputCapture } from "../foreground-output-capture";

describe("ForegroundOutputCapture", () => {
  it("keeps only the bounded replay tail across stdout and stderr", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const capture = new ForegroundOutputCapture(stdout, stderr, 5);

    stdout.write("1234");
    stderr.write("abcdef");

    await expect(capture.finish()).resolves.toEqual({
      stdout: "",
      stderr: "bcdef",
    });
  });

  it("creates private spool files and removes them after promotion replay", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const capture = new ForegroundOutputCapture(stdout, stderr);
    const internals = capture as unknown as {
      stdoutCapture: { outputPath: string; writer: WriteStream };
      stderrCapture: { outputPath: string; writer: WriteStream };
    };
    await Promise.all([
      once(internals.stdoutCapture.writer, "open"),
      once(internals.stderrCapture.writer, "open"),
    ]);

    if (process.platform !== "win32") {
      const [stdoutStat, stderrStat] = await Promise.all([
        stat(internals.stdoutCapture.outputPath),
        stat(internals.stderrCapture.outputPath),
      ]);
      expect(stdoutStat.mode & 0o777).toBe(0o600);
      expect(stderrStat.mode & 0o777).toBe(0o600);
    }

    stdout.write("stdout");
    stderr.write("stderr");
    const promoted = capture.promote();
    const collect = async (
      chunks: AsyncIterable<Buffer | string> | Iterable<Buffer | string>,
    ) => {
      const output: Buffer[] = [];
      for await (const chunk of chunks) {
        output.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(output).toString("utf8");
    };

    await expect(
      Promise.all([collect(promoted.stdout), collect(promoted.stderr)]),
    ).resolves.toEqual(["stdout", "stderr"]);
    await expect(stat(internals.stdoutCapture.outputPath)).rejects.toMatchObject(
      { code: "ENOENT" },
    );
    await expect(stat(internals.stderrCapture.outputPath)).rejects.toMatchObject(
      { code: "ENOENT" },
    );
    await promoted.dispose?.();
  });
});
