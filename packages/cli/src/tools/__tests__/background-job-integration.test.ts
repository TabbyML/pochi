import { describe, expect, it } from "vitest";
import { executeToolCall } from "../index";
import { BackgroundJobManager } from "../../lib/background-job-manager";
import * as path from "node:path";

describe("executeToolCall with background jobs", () => {

  it("should pass backgroundJobManager to tool execution", async () => {
    const manager = new BackgroundJobManager();
    const cwd = path.resolve(".");
    
    // Mock the tool call
    const toolCall: any = {
      type: "tool-startBackgroundJob",
      toolCallId: "test-id",
      toolName: "startBackgroundJob",
      input: {
        command: "echo hello",
        cwd: ".",
      },
    };


    // We verified that executeToolCall calls the tool function with `options` first.
    // The tool function (startBackgroundJob) now extracts backgroundJobManager from `options` (context).
    
    const result = (await executeToolCall(
      toolCall,
      {
        rg: "rg",
        backgroundJobManager: manager,
      },
      cwd
    )) as any;
    
    // If it failed with the specific error, result would contain error message

    if ('error' in result) {
        expect(result.error).not.toContain("Background job manager not available.");
    }
    
    // It should succeed and return backgroundJobId
    expect(result).toHaveProperty("backgroundJobId");
    
    // Clean up
    if ('backgroundJobId' in result) {
        manager.kill(result.backgroundJobId as string);
    }
  });
});