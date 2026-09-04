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
});
