import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BackgroundJobManager } from "../background-job-manager";

describe("BackgroundJobManager", () => {
  it("should start and kill a job", async () => {
    const manager = new BackgroundJobManager();
    const { backgroundJobId, outputFile } = manager.start("sleep 10", ".");
    expect(backgroundJobId).toMatch(/^bgjob-cmd-/);
    expect(outputFile).toContain(backgroundJobId);

    // Access private property for testing
    const job = (manager as any).jobs.get(backgroundJobId);
    expect(job).toBeDefined();
    expect(job.status).toBe("running");

    const killed = manager.kill(backgroundJobId);
    expect(killed).toBe(true);
  });

  it("should capture output", async () => {
    const manager = new BackgroundJobManager();
    const { backgroundJobId, outputFile } = manager.start(
      "echo 'hello world'",
      ".",
    );

    // Wait for output
    await new Promise((resolve) => setTimeout(resolve, 500));

    const result = manager.readOutput(backgroundJobId);
    expect(result).toBeDefined();
    expect(result?.output).toContain("hello world");

    // Check status
    // It might be completed by now
    expect(result?.status).toBe("completed");
    expect(await readFile(outputFile, "utf8")).toContain("hello world");

    // Read again, buffer should be empty
    const result2 = manager.readOutput(backgroundJobId);
    expect(result2?.output).toBe("");
  });

  it("should guide agents away from rapid empty reads", () => {
    const manager = new BackgroundJobManager();
    const { backgroundJobId } = manager.start("sleep 10", ".");

    const firstResult = manager.readOutput(backgroundJobId);
    expect(firstResult?.output).toBe("");

    expect(() => manager.readOutput(backgroundJobId)).toThrow(
      /executeCommand to run `sleep 1`/,
    );

    manager.kill(backgroundJobId);
  });

  it("should wait for all jobs to complete", async () => {
    const manager = new BackgroundJobManager();
    manager.start("sleep 0.1", ".");
    manager.start("sleep 0.2", ".");

    const result = await manager.waitForAllJobs(1000);
    expect(result).toBe("completed");
    expect(manager.hasPendingJobs()).toBe(false);
  });

  it("should timeout if jobs take too long", async () => {
    const manager = new BackgroundJobManager();
    manager.start("sleep 2", ".");

    const result = await manager.waitForAllJobs(100);
    expect(result).toBe("timeout");
    expect(manager.hasPendingJobs()).toBe(true);
    manager.killAll();
  });

  it("emits its terminal event after the output file is readable", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "pochi-bgjob-test-"));
    try {
      const manager = new BackgroundJobManager({
        taskId: "task-test",
        outputDir,
      });
      const eventPromise = new Promise<
        Parameters<Parameters<typeof manager.onDidFinish>[0]>[0]
      >((resolve) => manager.onDidFinish(resolve));
      const { backgroundJobId } = manager.start("printf notification", ".");

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
      const manager = new BackgroundJobManager({
        taskId: "task-test",
        outputDir,
      });
      const eventPromise = new Promise<
        Parameters<Parameters<typeof manager.onDidFinish>[0]>[0]
      >((resolve) => manager.onDidFinish(resolve));
      const script = [
        "const bytes = Buffer.from('中文');",
        "process.stdout.write(bytes.subarray(0, 1));",
        "setTimeout(() => {",
        "process.stdout.write(bytes.subarray(1));",
        "process.stdout.write('\\x1b]633;C\\x07\\x1b[31m红\\x1b[0m');",
        "}, 20);",
      ].join("");
      manager.start(
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
    const outputDir = await mkdtemp(join(tmpdir(), "pochi-bgjob-stop-utf8-test-"));
    try {
      const manager = new BackgroundJobManager({
        taskId: "task-test",
        outputDir,
      });
      const eventPromise = new Promise<
        Parameters<Parameters<typeof manager.onDidFinish>[0]>[0]
      >((resolve) => manager.onDidFinish(resolve));
      const script = [
        "const bytes = Buffer.from('中');",
        "process.stdout.write(Buffer.concat([Buffer.from('ready'), bytes.subarray(0, 1)]));",
        "setInterval(() => {}, 1000);",
      ].join("");
      const { backgroundJobId, outputFile } = manager.start(
        `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`,
        ".",
      );

      await expect.poll(() => readFile(outputFile, "utf8")).toBe("ready");
      expect(manager.kill(backgroundJobId)).toBe(true);

      const event = await eventPromise;
      expect(event.status).toBe("stopped");
      expect(await readFile(outputFile, "utf8")).toBe("ready");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
