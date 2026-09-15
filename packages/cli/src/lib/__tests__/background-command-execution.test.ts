import { createTestCliAdaptor, nextCommandResult } from "./cli-adaptor";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("CliRunningTaskAdaptor background commands", () => {
  let testOutputDir: string;
  beforeEach(async () => {
    testOutputDir = await mkdtemp(join(tmpdir(), "pochi-command-test-"));
  });
  afterEach(async () => {
    await rm(testOutputDir, { recursive: true, force: true });
  });
  it("should start and kill a job", async () => {
    const adaptor = createTestCliAdaptor({ commandOutputDir: testOutputDir });
    const { backgroundJobId, outputFile } = adaptor.startBackgroundCommand(
      "task-test",
      "sleep 10",
      ".",
    );
    expect(backgroundJobId).toMatch(/^bgjob-cmd-/);
    expect(outputFile).toContain(backgroundJobId);

    const result = nextCommandResult(adaptor, "task-test");
    await adaptor.commandSource.kill(backgroundJobId);
    expect((await result).status).toBe("stopped");
  });

  it("should capture output", async () => {
    const adaptor = createTestCliAdaptor({ commandOutputDir: testOutputDir });
    const { backgroundJobId, outputFile } = adaptor.startBackgroundCommand(
      "task-test",
      "echo 'hello world'",
      ".",
    );

    expect((await nextCommandResult(adaptor, "task-test")).status).toBe(
      "completed",
    );
    expect(await readFile(outputFile, "utf8")).toContain("hello world");
    expect(backgroundJobId).toMatch(/^bgjob-cmd-/);
  });

  it("captures live adopted output while replaying initial output", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "pochi-bgjob-adopt-test-"));
    try {
      const adaptor = createTestCliAdaptor({ commandOutputDir: outputDir });
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), {
        stdout,
        stderr,
        kill: () => true,
      }) as unknown as ChildProcess;
      let releaseReplay: () => void = () => {};
      const replayGate = new Promise<void>((resolve) => {
        releaseReplay = resolve;
      });
      const initialStdout = (async function* () {
        yield Buffer.from("before");
        await replayGate;
      })();

      const { outputFile } = adaptor.adoptBackgroundCommand(
        "task-test",
        child,
        "test",
        {
          stdout: initialStdout,
          stderr: [],
        },
      );
      stdout.end("after");
      stderr.end();
      stdout.destroy();
      stderr.destroy();
      releaseReplay();
      child.emit("close", 0);

      expect((await nextCommandResult(adaptor, "task-test")).status).toBe(
        "completed",
      );
      expect(await readFile(outputFile, "utf8")).toBe("beforeafter");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("cleans up commands from every owner before returning from shutdown", async () => {
    const adaptor = createTestCliAdaptor({ commandOutputDir: testOutputDir });
    const first = nextCommandResult(adaptor, "first");
    const second = nextCommandResult(adaptor, "second");
    adaptor.startBackgroundCommand("first", "sleep 10", ".");
    adaptor.startBackgroundCommand("second", "sleep 10", ".");
    await adaptor.stopBackgroundCommands();
    for (const result of await Promise.all([first, second])) {
      expect(result.status).toBe("stopped");
      expect(await readFile(result.outputFile, "utf8")).toBe("");
    }
  });

  it("emits its terminal event after the output file is readable", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "pochi-bgjob-test-"));
    try {
      const adaptor = createTestCliAdaptor({
        commandOutputDir: outputDir,
      });
      const eventPromise = nextCommandResult(adaptor, "task-test");
      const { backgroundJobId } = adaptor.startBackgroundCommand(
        "task-test",
        "printf notification",
        ".",
      );

      const event = await eventPromise;
      expect(event.backgroundJobId).toBe(backgroundJobId);
      expect(event.status).toBe("completed");
      expect(event.exitCode).toBe(0);
      expect(await readFile(event.outputFile, "utf8")).toBe("notification");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("preserves split UTF-8 and removes terminal control sequences", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "pochi-bgjob-utf8-test-"));
    try {
      const adaptor = createTestCliAdaptor({
        commandOutputDir: outputDir,
      });
      const eventPromise = nextCommandResult(adaptor, "task-test");
      const script = [
        "const bytes = Buffer.from('中文');",
        "process.stdout.write(bytes.subarray(0, 1));",
        "setTimeout(() => {",
        "process.stdout.write(bytes.subarray(1));",
        "process.stdout.write('\\x1b]633;C\\x07\\x1b[31m红\\x1b[0m');",
        "}, 20);",
      ].join("");
      adaptor.startBackgroundCommand(
        "task-test",
        `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`,
        ".",
      );

      const event = await eventPromise;
      expect(await readFile(event.outputFile, "utf8")).toBe("中文红");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("discards an incomplete UTF-8 character when manually stopped", async () => {
    const outputDir = await mkdtemp(
      join(tmpdir(), "pochi-bgjob-stop-utf8-test-"),
    );
    try {
      const adaptor = createTestCliAdaptor({
        commandOutputDir: outputDir,
      });
      const eventPromise = nextCommandResult(adaptor, "task-test");
      const script = [
        "const bytes = Buffer.from('中');",
        "process.stdout.write(Buffer.concat([Buffer.from('ready'), bytes.subarray(0, 1)]));",
        "setInterval(() => {}, 1000);",
      ].join("");
      const { backgroundJobId, outputFile } = adaptor.startBackgroundCommand(
        "task-test",
        `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`,
        ".",
      );

      await expect.poll(() => readFile(outputFile, "utf8")).toBe("ready");
      await adaptor.commandSource.kill(backgroundJobId);

      const event = await eventPromise;
      expect(event.status).toBe("stopped");
      expect(await readFile(outputFile, "utf8")).toBe("ready");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
