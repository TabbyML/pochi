import { describe, expect, it, afterEach } from "vitest";
import { validateToolPolicy } from "@getpochi/tools";
import { executeToolCall } from "../index";
import { BackgroundJobManager } from "../../lib/background-job-manager";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { NodeBlobStore } from "../../node-blob-store";
import { FileStateCache } from "@getpochi/common/tool-utils";
import os from "node:os";

describe("executeToolCall with background jobs", () => {
  const testBlobStorage = path.join(os.tmpdir(), "pochi-test", "blobs");

  afterEach(async () => {
    await fs.rm(testBlobStorage, { recursive: true, force: true });
  });

  it("should pass backgroundJobManager to tool execution", async () => {
    const manager = new BackgroundJobManager();
    const cwd = path.resolve(".");
    const blobStore = new NodeBlobStore(testBlobStorage);

    // Mock the tool call
    const toolCall: any = {
      type: "tool-executeCommand",
      toolCallId: "test-id",
      toolName: "executeCommand",
      input: {
        command: "echo hello",
        cwd: ".",
        background: true,
      },
    };


    // We verified that executeToolCall calls the tool function with `options` first.
    // executeCommand extracts backgroundJobManager from its tool context when
    // background execution is requested.

    const result = (await executeToolCall(
      toolCall,
      {
        rg: "rg",
        backgroundJobManager: manager,
        fileSystem: {
          readFile: async () => new Uint8Array(),
          writeFile: async () => {},
        },
        blobStore,
        fileStateCache: new FileStateCache(),
      },
      cwd
    )) as any;


    // If it failed with the specific error, result would contain error message

    if ('error' in result) {
        expect(result.error).not.toContain("Background job manager not available.");
    }

    // It should succeed and describe the background job in the public output.
    expect(result.output).toContain(result._meta.backgroundJobId);
    expect(result.output).toContain(".log");

    // Clean up
    manager.kill(result._meta.backgroundJobId);
  });

  it("returns a tool error when file path policy validation fails", async () => {
    const cwd = path.resolve(".");

    const toolCall: any = {
      type: "tool-readFile",
      toolCallId: "test-id",
      toolName: "readFile",
      input: {
        path: "../secret.txt",
      },
    };

    expect(() =>
      validateToolPolicy(
        "readFile",
        toolCall.input,
        {
          readFile: {
            kind: "path-pattern",
            patterns: ["src/**"],
          },
        },
        { cwd },
      ),
    ).toThrow(
      "Path is not allowed by the configured path rules.",
    );
  });

  it("allows file reads when the workspace path matches configured path rules", async () => {
    const cwd = path.resolve(".");
    const blobStore = new NodeBlobStore(testBlobStorage);
    const readFile = async () => new TextEncoder().encode("hello from src");

    const toolCall: any = {
      type: "tool-readFile",
      toolCallId: "test-id",
      toolName: "readFile",
      input: {
        path: "src/index.ts",
      },
    };

    validateToolPolicy(
      "readFile",
      toolCall.input,
      {
        readFile: {
          kind: "path-pattern",
          patterns: ["src/**"],
        },
      },
      { cwd },
    );

    const result = (await executeToolCall(
      toolCall,
      {
        rg: "rg",
        backgroundJobManager: new BackgroundJobManager(),
        fileSystem: {
          readFile,
          writeFile: async () => {},
        },
        blobStore,
        fileStateCache: new FileStateCache(),
      },
      cwd,
    )) as any;

    expect(result).toEqual({
      content: "hello from src",
      isTruncated: false,
      filePath: path.join(cwd, "src/index.ts"),
      numLines: 1,
      startLine: 1,
      totalLines: 1,
    });
  });

  it("allows file reads when the virtual path matches configured path rules", async () => {
    const cwd = path.resolve(".");
    const blobStore = new NodeBlobStore(testBlobStorage);
    const readFile = async () => new TextEncoder().encode("hello from pochi");

    const toolCall: any = {
      type: "tool-readFile",
      toolCallId: "test-id",
      toolName: "readFile",
      input: {
        path: "pochi://-/plan.md",
      },
    };

    validateToolPolicy(
      "readFile",
      toolCall.input,
      {
        readFile: {
          kind: "path-pattern",
          patterns: ["pochi://-/plan.md"],
        },
      },
      { cwd },
    );

    const result = (await executeToolCall(
      toolCall,
      {
        rg: "rg",
        backgroundJobManager: new BackgroundJobManager(),
        fileSystem: {
          readFile,
          writeFile: async () => {},
        },
        blobStore,
        fileStateCache: new FileStateCache(),
      },
      cwd,
    )) as any;

    expect(result).toEqual({
      content: "hello from pochi",
      isTruncated: false,
      filePath: "pochi://-/plan.md",
      numLines: 1,
      startLine: 1,
      totalLines: 1,
    });
  });
});
