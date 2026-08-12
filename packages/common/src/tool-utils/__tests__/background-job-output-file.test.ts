import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BackgroundJobOutputFile } from "../background-job";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("BackgroundJobOutputFile", () => {
  it("serializes writes and flushes them before close resolves", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pochi-output-file-"));
    tempDirs.push(dir);
    const outputFile = path.join(dir, "job.log");
    const writer = new BackgroundJobOutputFile(outputFile);

    const writes = [writer.append("first\n"), writer.append("second\n")];
    await writer.close();

    await expect(Promise.all(writes)).resolves.toEqual([undefined, undefined]);
    await expect(readFile(outputFile, "utf8")).resolves.toBe(
      "first\nsecond\n",
    );
  });

  it("rejects writes after close", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pochi-output-file-"));
    tempDirs.push(dir);
    const writer = new BackgroundJobOutputFile(path.join(dir, "job.log"));

    await writer.close();

    await expect(writer.append("too late")).rejects.toThrow(/closed/);
  });
});
