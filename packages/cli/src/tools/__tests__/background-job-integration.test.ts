import { describe, expect, it, afterEach } from "vitest";
import { executeToolCall } from "../index";
import { BackgroundJobManager } from "../../lib/background-job-manager";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { AsyncSubTaskManager } from "../../lib/async-subtask-manager";
import { catalog } from "@getpochi/livekit";
import { makeAdapter } from "@livestore/adapter-node";
import { createStorePromise } from "@livestore/livestore";
import { NodeBlobStore } from "../../node-blob-store";
import { FileStateCache } from "@getpochi/common/tool-utils";
import os from "node:os";

async function createAsyncTaskManager() {
  const store = await createStorePromise({
    adapter: makeAdapter({ storage: { type: "in-memory" } }),
    schema: catalog.schema,
    storeId: `test-${crypto.randomUUID()}`,
    syncPayload: {},
  });

  return new AsyncSubTaskManager(store);
}

describe("executeToolCall with background jobs", () => {
  const testBlobStorage = path.join(os.tmpdir(), "pochi-test", "blobs");

  afterEach(async () => {
    await fs.rm(testBlobStorage, { recursive: true, force: true });
  });

  it("should pass backgroundJobManager to tool execution", async () => {
    const manager = new BackgroundJobManager();
    const store = await createStorePromise({
      adapter: makeAdapter({ storage: { type: "in-memory" } }),
      schema: catalog.schema,
      storeId: `test-${crypto.randomUUID()}`,
      syncPayload: {},
    });
    const asyncSubTaskManager = new AsyncSubTaskManager(store);
    const cwd = path.resolve(".");
    const blobStore = new NodeBlobStore(testBlobStorage);
    
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
        asyncSubTaskManager,
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
    
    // It should succeed and return backgroundJobId
    expect(result).toHaveProperty("backgroundJobId");
    
    // Clean up
    if ('backgroundJobId' in result) {
        manager.kill(result.backgroundJobId as string);
    }
  });

  it("stringifies non-string async task results", async () => {
    const store = await createStorePromise({
      adapter: makeAdapter({ storage: { type: "in-memory" } }),
      schema: catalog.schema,
      storeId: `test-${crypto.randomUUID()}`,
      syncPayload: {},
    });

    const taskId = crypto.randomUUID();
    const now = new Date();
    const resultObject = { ok: true, count: 2 };

    store.commit(
      catalog.events.taskInited({
        id: taskId,
        parentId: undefined,
        runAsync: true,
        createdAt: now,
        cwd: path.resolve("."),
        initMessages: [],
        initTitle: undefined,
        displayId: undefined,
      }),
    );

    const messageId = crypto.randomUUID();
    store.commit(
      catalog.events.chatStreamFinished({
        id: taskId,
        data: {
          id: messageId,
          role: "assistant",
          parts: [
            { type: "step-start" },
            {
              type: "tool-attemptCompletion",
              state: "input-available",
              input: {
                result: resultObject,
              },
            },
          ],
        } as any,
        totalTokens: null,
        status: "completed",
        updatedAt: now,
        duration: undefined,
        lastCheckpointHash: undefined,
      }),
    );

    const manager = new AsyncSubTaskManager(store);
    manager.registerTask(taskId);

    const output = manager.readTaskOutput(taskId);
    expect(output?.status).toBe("completed");
    expect(output?.output).toBe(JSON.stringify(resultObject));
  });

  it("returns a tool error when file path policy validation fails", async () => {
    const cwd = path.resolve(".");
    const blobStore = new NodeBlobStore(testBlobStorage);

    const toolCall: any = {
      type: "tool-readFile",
      toolCallId: "test-id",
      toolName: "readFile",
      input: {
        path: "../secret.txt",
      },
    };

    const result = (await executeToolCall(
      toolCall,
      {
        rg: "rg",
        backgroundJobManager: new BackgroundJobManager(),
        asyncSubTaskManager: new AsyncSubTaskManager(
          await createStorePromise({
            adapter: makeAdapter({ storage: { type: "in-memory" } }),
            schema: catalog.schema,
            storeId: `test-${crypto.randomUUID()}`,
            syncPayload: {},
          }),
        ),
        fileSystem: {
          readFile: async () => new Uint8Array(),
          writeFile: async () => {},
        },
        blobStore,
        fileStateCache: new FileStateCache(),
      },
      cwd,
      undefined,
      undefined,
      undefined,
      {
        readFile: {
          kind: "path-pattern",
          patterns: ["src/**"],
        },
      },
    )) as any;

    expect(result.error).toContain(
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

    const result = (await executeToolCall(
      toolCall,
      {
        rg: "rg",
        backgroundJobManager: new BackgroundJobManager(),
        asyncSubTaskManager: await createAsyncTaskManager(),
        fileSystem: {
          readFile,
          writeFile: async () => {},
        },
        blobStore,
        fileStateCache: new FileStateCache(),
      },
      cwd,
      undefined,
      undefined,
      undefined,
      {
        readFile: {
          kind: "path-pattern",
          patterns: ["src/**"],
        },
      },
    )) as any;

    expect(result).toEqual({
      content: "hello from src",
      isTruncated: false,
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

    const result = (await executeToolCall(
      toolCall,
      {
        rg: "rg",
        backgroundJobManager: new BackgroundJobManager(),
        asyncSubTaskManager: await createAsyncTaskManager(),
        fileSystem: {
          readFile,
          writeFile: async () => {},
        },
        blobStore,
        fileStateCache: new FileStateCache(),
      },
      cwd,
      undefined,
      undefined,
      undefined,
      {
        readFile: {
          kind: "path-pattern",
          patterns: ["pochi://-/plan.md"],
        },
      },
    )) as any;

    expect(result).toEqual({
      content: "hello from pochi",
      isTruncated: false,
    });
  });
});
