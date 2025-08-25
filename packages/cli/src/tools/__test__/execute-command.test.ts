import { describe, expect, it } from "vitest";
import { executeCommand } from "../execute-command";
import type { ToolCallOptions } from "../../types";

describe("executeCommand", () => {
  const mockContext: ToolCallOptions = {
    cwd: process.cwd(),
    rg: "",
  };

  const mockToolExecutionOptions = {
    toolCallId: "test-call-id",
    messages: [],
    abortSignal: new AbortController().signal,
  };

  it("should execute a simple command successfully", async () => {
    const result = await executeCommand(mockContext)(
      { command: "echo 'Hello World'" },
      mockToolExecutionOptions,
    );

    expect(result.output).toContain("Hello World");
    expect(result.isTruncated).toBe(false);
  });

  it("should handle command timeout", async () => {
    await expect(
      executeCommand(mockContext)(
        { command: "sleep 3", timeout: 1 }, // Sleep for 3 seconds with 1 second timeout
        mockToolExecutionOptions,
      )
    ).rejects.toThrow("Command execution timed out after 1 seconds");
  });

  it("should handle abort signal", async () => {
    const abortController = new AbortController();
    const options = {
      ...mockToolExecutionOptions,
      abortSignal: abortController.signal,
    };
    
    // Start command and abort it immediately
    const promise = executeCommand(mockContext)(
      { command: "sleep 5", timeout: 10 },
      options,
    );

    // Abort after a short delay
    setTimeout(() => abortController.abort(), 100);

    await expect(promise).rejects.toThrow("Command execution was aborted");
  });

  it("should use default timeout when not specified", async () => {
    // This test just ensures the default timeout doesn't interfere with quick commands
    const result = await executeCommand(mockContext)(
      { command: "echo 'test'" },
      mockToolExecutionOptions,
    );

    expect(result.output).toContain("test");
  });

  it("should handle command errors", async () => {
    await expect(
      executeCommand(mockContext)(
        { command: "nonexistentcommand" },
        mockToolExecutionOptions,
      )
    ).rejects.toThrow("Command execution failed:");
  });

  it("should indicate when output is truncated", async () => {
    // Create a command that generates a lot of output
    const longOutput = "a".repeat(100);
    const result = await executeCommand(mockContext)(
      { command: `echo '${longOutput}'` },
      mockToolExecutionOptions,
    );

    expect(result.output).toContain(longOutput);
    // This specific test won't trigger truncation unless the output is very large
    // but it tests the structure
    expect(typeof result.isTruncated).toBe("boolean");
  });

  it("should handle timeout errors correctly with proper formatting", async () => {
    await expect(
      executeCommand(mockContext)(
        { command: "sleep 2", timeout: 1 }, // Sleep for 2 seconds with 1 second timeout
        mockToolExecutionOptions,
      )
    ).rejects.toThrow("Command execution timed out after 1 seconds");
  });

  it("should handle abort errors correctly with proper formatting", async () => {
    const abortController = new AbortController();
    const options = {
      ...mockToolExecutionOptions,
      abortSignal: abortController.signal,
    };
    
    // Start command and abort it immediately
    const promise = executeCommand(mockContext)(
      { command: "sleep 3", timeout: 10 },
      options,
    );

    // Abort after a short delay
    setTimeout(() => abortController.abort(), 50);

    await expect(promise).rejects.toThrow("Command execution was aborted");
  });

  it("should handle generic errors correctly with proper formatting", async () => {
    await expect(
      executeCommand(mockContext)(
        { command: "invalidcommandthatdoesnotexist" },
        mockToolExecutionOptions,
      )
    ).rejects.toThrow("Command execution failed:");
  });

  it("should set GIT_COMMITTER environment variables", async () => {
    // Use platform-appropriate syntax for environment variables
    let command: string;
    if (process.platform === "win32") {
      // Check if we're using PowerShell or cmd
      const shell = process.env.ComSpec?.toLowerCase();
      if (shell?.includes("powershell") || !shell) {
        // PowerShell syntax
        command = "Write-Output \"$env:GIT_COMMITTER_NAME $env:GIT_COMMITTER_EMAIL\"";
      } else {
        // cmd.exe syntax
        command = "echo %GIT_COMMITTER_NAME% %GIT_COMMITTER_EMAIL%";
      }
    } else {
      // Unix-style (bash/zsh/sh)
      command = "echo $GIT_COMMITTER_NAME $GIT_COMMITTER_EMAIL";
    }

    const result = await executeCommand(mockContext)(
      { command },
      mockToolExecutionOptions,
    );

    expect(result.output).toContain("Pochi");
    expect(result.output).toContain("noreply@getpochi.com");
  });
});
