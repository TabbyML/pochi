import * as assert from "node:assert";
import type { ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { describe, it } from "mocha";
import {
  spawnBackgroundChildProcess,
  terminateChildProcessTree,
} from "../background-child-process";

function collectStdout(child: ChildProcess): Promise<{
  output: string;
  code: number | null;
}> {
  let output = "";
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => {
    output += chunk;
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve({ output, code }));
  });
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

describe("background child process", () => {
  it("runs a shell command with piped output", async function () {
    this.timeout(10000);
    const child = spawnBackgroundChildProcess({
      command: "echo hello",
      cwd: tmpdir(),
    });
    const { output, code } = await collectStdout(child);

    assert.match(output, /hello/);
    assert.strictEqual(code, 0);
  });

  it("closes stdin so commands cannot wait for input", async function () {
    if (process.platform === "win32") this.skip();
    this.timeout(10000);
    const child = spawnBackgroundChildProcess({
      command: "cat; echo done",
      cwd: tmpdir(),
    });
    const { output, code } = await collectStdout(child);

    assert.strictEqual(output.trim(), "done");
    assert.strictEqual(code, 0);
  });

  it("stops the command together with its descendants", async function () {
    if (process.platform === "win32") this.skip();
    this.timeout(10000);
    const child = spawnBackgroundChildProcess({
      command: "sleep 30 & echo $!; wait",
      cwd: tmpdir(),
    });
    const closed = collectStdout(child);
    const descendantPid = await new Promise<number>((resolve) => {
      child.stdout?.once("data", (chunk: string) => resolve(Number(chunk)));
    });
    assert.ok(isRunning(descendantPid));

    await terminateChildProcessTree(child);
    await closed;

    assert.strictEqual(isRunning(descendantPid), false);
  });

  it("resolves when the process already exited", async function () {
    this.timeout(10000);
    const child = spawnBackgroundChildProcess({
      command: "echo done",
      cwd: tmpdir(),
    });
    await collectStdout(child);

    await terminateChildProcessTree(child);
  });
});
