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
});
