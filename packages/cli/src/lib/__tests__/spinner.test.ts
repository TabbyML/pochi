import { PassThrough } from "node:stream";
import type { WriteStream } from "node:tty";
import { expect, it } from "vitest";
import { createSpinner } from "../spinner";

it("uses plain output for a zero-width terminal instead of an infinite clear loop", () => {
  const stream = Object.assign(new PassThrough(), { isTTY: true, columns: 0 });
  let output = "";
  stream.on("data", (chunk) => {
    output += chunk;
  });
  const spinner = createSpinner({
    stream: stream as unknown as WriteStream,
    isEnabled: true,
    text: "Waiting for background work",
  });
  spinner.start();
  expect(spinner.isSpinning).toBe(false);
  spinner.succeed("Background work finished");
  expect(output).toContain("Waiting for background work");
  expect(output).toContain("Background work finished");
});
