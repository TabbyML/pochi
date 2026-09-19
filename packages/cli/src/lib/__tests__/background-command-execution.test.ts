import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestCliAdaptor, nextCommandResult } from "./cli-adaptor";

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
    await adaptor.commandAdaptor.kill(backgroundJobId);
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

  it.skipIf(process.platform === "win32").each([
    { ignoreSigterm: false, redirectOutput: false },
    { ignoreSigterm: true, redirectOutput: false },
    { ignoreSigterm: true, redirectOutput: true },
  ])(
    "stops shell descendants ($ignoreSigterm, redirected: $redirectOutput)",
    async ({ ignoreSigterm, redirectOutput }) => {
      const adaptor = createTestCliAdaptor({ commandOutputDir: testOutputDir });
      const script = [
        ignoreSigterm ? "process.on('SIGTERM', () => {});" : "",
        redirectOutput
          ? `require('node:fs').writeFileSync(${JSON.stringify(join(testOutputDir, "pid"))}, String(process.pid));`
          : "console.log(process.pid);",
        "setInterval(() => {}, 1000);",
      ].join("");
      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
      const { backgroundJobId, outputFile } = adaptor.startBackgroundCommand(
        "task-tree",
        `${quote(process.execPath)} -e ${quote(script)} ${redirectOutput ? "> /dev/null 2>&1" : ""}; wait`,
        ".",
      );
      let pid: number | undefined;
      let status: string | undefined;
      const subscription = await adaptor.commandAdaptor.observeNotifications(
        "task-tree",
        (notices) => {
          status = notices[0]?.status;
        },
      );
      try {
        const pidFile = redirectOutput
          ? join(testOutputDir, "pid")
          : outputFile;
        await expect.poll(() => readFile(pidFile, "utf8")).toMatch(/^\d+\n?$/);
        pid = Number.parseInt(await readFile(pidFile, "utf8"));
        await adaptor.commandAdaptor.kill(backgroundJobId);
        expect(status).toBe("stopped");
        await vi.waitFor(
          () => {
            expect(() => process.kill(pid!, 0)).toThrow();
          },
          { timeout: 2500 },
        );
        expect((await nextCommandResult(adaptor, "task-tree")).status).toBe(
          "stopped",
        );
      } finally {
        subscription.dispose();
        if (pid) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            /* Already exited. */
          }
        }
        await adaptor.stopBackgroundCommands();
      }
    },
  );

  it.each([
    ["printf problem >&2; exit 7", ".", 7],
    [
      "printf unreachable",
      "/pochi-regression-nonexistent-directory",
      undefined,
    ],
  ] as const)(
    "reports failed commands and spawn errors (%s)",
    async (command, cwd, exitCode) => {
      const adaptor = createTestCliAdaptor({ commandOutputDir: testOutputDir });
      try {
        const { outputFile } = adaptor.startBackgroundCommand(
          "failure",
          command,
          cwd,
        );
        const event = await nextCommandResult(adaptor, "failure");
        expect(event.status).toBe("failed");
        expect(event.exitCode).toBe(exitCode);
        expect(await readFile(outputFile, "utf8")).toBe(
          exitCode ? "problem" : "",
        );
        if (exitCode === undefined) expect(event.summary).toContain("ENOENT");
      } finally {
        await adaptor.stopBackgroundCommands();
      }
    },
  );

  it("stops the process when its output file cannot be opened", async () => {
    const invalidDir = join(testOutputDir, "not-a-directory");
    const marker = join(testOutputDir, "leaked");
    await writeFile(invalidDir, "file");
    const adaptor = createTestCliAdaptor({ commandOutputDir: invalidDir });
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    expect(() =>
      adaptor.startBackgroundCommand(
        "unregistered",
        `sleep 0.1; printf leaked > ${quote(marker)}`,
        ".",
      ),
    ).toThrow();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
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
      await adaptor.commandAdaptor.kill(backgroundJobId);

      const event = await eventPromise;
      expect(event.status).toBe("stopped");
      expect(await readFile(outputFile, "utf8")).toBe("ready");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
