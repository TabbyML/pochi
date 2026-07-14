import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => {
  return { spawnMock: vi.fn() };
});

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

import { searchFilesWithRipgrep } from "../ripgrep";

class MockChildProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  closed = false;

  kill = vi.fn(() => {
    this.killed = true;
    this.close(null, "SIGTERM");
    return true;
  });

  close(code: number | null, signal: NodeJS.Signals | null) {
    if (this.closed) {
      return;
    }

    this.closed = true;
    queueMicrotask(() => this.emit("close", code, signal));
  }
}

function mockSpawnResult({
  stdout = "",
  stderr = "",
  code = 0,
  error,
}: {
  stdout?: string | string[];
  stderr?: string;
  code?: number;
  error?: Error;
}) {
  const child = new MockChildProcess();
  spawnMock.mockReturnValueOnce(child);

  queueMicrotask(() => {
    if (error) {
      child.emit("error", error);
      return;
    }

    if (stderr) {
      child.stderr.write(stderr);
      child.stderr.end();
    }

    const chunks = Array.isArray(stdout) ? stdout : [stdout];
    for (const chunk of chunks) {
      if (child.killed) {
        break;
      }
      child.stdout.write(chunk);
    }
    child.stdout.end();
    child.close(code, null);
  });

  return child;
}

describe("searchFilesWithRipgrep", () => {
  const rgPath = "/usr/bin/rg";
  const workspacePath = "/workspace";

  beforeEach(() => {
    spawnMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return matches for a successful search", async () => {
    const mockRgOutput = [
      {
        type: "match",
        data: {
          path: { text: "/workspace/src/index.ts" },
          lines: { text: "console.log('hello world');\n" },
          line_number: 10,
        },
      },
      {
        type: "match",
        data: {
          path: { text: "/workspace/src/app.ts" },
          lines: { text: "console.log('hello');\n" },
          line_number: 5,
        },
      },
    ]
      .map((o) => JSON.stringify(o))
      .join("\n");

    mockSpawnResult({ stdout: mockRgOutput });

    const result = await searchFilesWithRipgrep(
      ".",
      "hello",
      rgPath,
      workspacePath,
    );

    expect(result.matches).toEqual([
      {
        file: "src/index.ts",
        line: 10,
        context: "console.log('hello world');",
      },
      {
        file: "src/app.ts",
        line: 5,
        context: "console.log('hello');",
      },
    ]);
    expect(result.isTruncated).toBe(false);
    expect(spawnMock).toHaveBeenCalledWith(
      "/usr/bin/rg",
      [
        "--json",
        "--case-sensitive",
        "--binary",
        "--sortr",
        "modified",
        "hello",
        "/workspace",
      ],
      { signal: undefined },
    );
  });

  it("should return an empty array when no matches are found", async () => {
    mockSpawnResult({ code: 1 });

    const result = await searchFilesWithRipgrep(
      ".",
      "no-match",
      rgPath,
      workspacePath,
    );

    expect(result.matches).toEqual([]);
    expect(result.isTruncated).toBe(false);
  });

  it("should include filePattern in the command when provided", async () => {
    mockSpawnResult({ stdout: "" });

    await searchFilesWithRipgrep(
      ".",
      "hello",
      rgPath,
      workspacePath,
      "**/*.ts",
    );

    expect(spawnMock).toHaveBeenCalledWith(
      "/usr/bin/rg",
      [
        "--json",
        "--case-sensitive",
        "--binary",
        "--sortr",
        "modified",
        "--glob",
        "**/*.ts",
        "hello",
        "/workspace",
      ],
      { signal: undefined },
    );
  });

  it("should stop rg as soon as the global match limit is exceeded", async () => {
    const mockRgOutput = Array.from({ length: 501 }, (_, i) => ({
      type: "match",
      data: {
        path: { text: `/workspace/file${i}.ts` },
        lines: { text: `line ${i}\n` },
        line_number: i + 1,
      },
    }))
      .map((o) => JSON.stringify(o))
      .join("\n");

    const child = mockSpawnResult({ stdout: mockRgOutput });

    const result = await searchFilesWithRipgrep(
      ".",
      "hello",
      rgPath,
      workspacePath,
    );

    expect(result.matches.length).toBe(500);
    expect(result.isTruncated).toBe(true);
    expect(child.kill).toHaveBeenCalled();
  });

  it("should throw an error when rg fails with code > 1", async () => {
    mockSpawnResult({ code: 2, stderr: "A critical error occurred" });

    await expect(
      searchFilesWithRipgrep(".", "error", rgPath, workspacePath),
    ).rejects.toThrow("rg command failed with code 2: A critical error occurred");
  });

  it("should handle JSON parsing errors gracefully", async () => {
    const mockRgOutput =
      "invalid-json\n" +
      JSON.stringify({
        type: "match",
        data: {
          path: { text: "/workspace/src/app.ts" },
          lines: { text: "console.log('hello');\n" },
          line_number: 5,
        },
      });

    mockSpawnResult({ stdout: mockRgOutput });

    const result = await searchFilesWithRipgrep(
      ".",
      "hello",
      rgPath,
      workspacePath,
    );

    expect(result.matches.length).toBe(1);
    expect(result.matches[0].file).toBe("src/app.ts");
  });

  it("should process stdout when rg exits with code 1", async () => {
    const mockRgOutput = JSON.stringify({
      type: "match",
      data: {
        path: { text: "/workspace/src/app.ts" },
        lines: { text: "console.log('hello');\n" },
        line_number: 5,
      },
    });

    mockSpawnResult({
      code: 1,
      stdout: mockRgOutput,
      stderr: "A non-fatal error occurred",
    });

    const result = await searchFilesWithRipgrep(
      ".",
      "hello",
      rgPath,
      workspacePath,
    );

    expect(result.matches).toEqual([
      {
        file: "src/app.ts",
        line: 5,
        context: "console.log('hello');",
      },
    ]);
  });

  it("should rethrow an unexpected error", async () => {
    const unexpectedError = new Error("Unexpected error");
    mockSpawnResult({ error: unexpectedError });

    await expect(
      searchFilesWithRipgrep(".", "error", rgPath, workspacePath),
    ).rejects.toThrow("Unexpected error");
  });
});
