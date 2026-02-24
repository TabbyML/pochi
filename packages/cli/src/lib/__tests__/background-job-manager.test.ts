import { describe, expect, it } from "vitest";
import { BackgroundJobManager } from "../background-job-manager";

describe("BackgroundJobManager", () => {
  it("should start and kill a job", async () => {
    const manager = new BackgroundJobManager();
    const id = manager.start("sleep 10", ".");
    expect(id).toBeDefined();

    // Access private property for testing
    const job = (manager as any).jobs.get(id);
    expect(job).toBeDefined();
    expect(job.status).toBe("running");

    const killed = manager.kill(id);
    expect(killed).toBe(true);
  });

  it("should capture output", async () => {
    const manager = new BackgroundJobManager();
    const id = manager.start("echo 'hello world'", ".");

    // Wait for output
    await new Promise((resolve) => setTimeout(resolve, 500));

    const result = manager.readOutput(id);
    expect(result).toBeDefined();
    expect(result?.output).toContain("hello world");

    // Check status
    // It might be completed by now
    expect(result?.status).toBe("completed");

    // Read again, buffer should be empty
    const result2 = manager.readOutput(id);
    expect(result2?.output).toBe("");
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
});
