import * as assert from "node:assert";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildShellCommand } from "@getpochi/common/tool-utils";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";
import sinon from "sinon";
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
  for (const shell of ["cmd.exe", "C:\\Windows\\System32\\CMD.EXE"]) {
    it(`preserves quoted CMD scripts with ${shell}`, () => {
      const spawn = sinon.stub();
      const backend = proxyquire
        .noCallThru()
        .load("../background-child-process", {
          "node:child_process": { spawn },
          "@getpochi/common/tool-utils": { buildShellCommand },
          "./execute-command-with-node": { buildExecuteCommandEnv: () => ({}) },
        }) as typeof import("../background-child-process");
      const sandbox = sinon.createSandbox();
      const command =
        '"C:\\Program Files\\nodejs\\node.exe" "C:\\My App\\script.js" "你好 world"';
      try {
        sandbox.stub(process, "platform").value("win32");
        sandbox.stub(process, "env").value({ ...process.env, ComSpec: shell });

        backend.spawnBackgroundChildProcess({ command, cwd: "C:\\My App" });

        assert.strictEqual(spawn.callCount, 1);
        assert.strictEqual(spawn.firstCall.args[0], shell);
        assert.deepStrictEqual(spawn.firstCall.args[1], [
          "/d",
          "/s",
          "/c",
          `"chcp 65001>nul & ${command}"`,
        ]);
        const options = spawn.firstCall.args[2] as SpawnOptions;
        assert.strictEqual(options.windowsVerbatimArguments, true);
        assert.strictEqual(options.detached, false);
      } finally {
        sandbox.restore();
      }
    });
  }

  it("keeps normal argument serialization for PowerShell", () => {
    const spawn = sinon.stub();
    const backend = proxyquire
      .noCallThru()
      .load("../background-child-process", {
        "node:child_process": { spawn },
        "@getpochi/common/tool-utils": { buildShellCommand },
        "./execute-command-with-node": { buildExecuteCommandEnv: () => ({}) },
      }) as typeof import("../background-child-process");
    const sandbox = sinon.createSandbox();
    try {
      sandbox.stub(process, "platform").value("win32");
      sandbox
        .stub(process, "env")
        .value({ ...process.env, ComSpec: "powershell.exe" });

      backend.spawnBackgroundChildProcess({
        command: 'Write-Output "你好 world"',
        cwd: "C:\\",
      });

      assert.strictEqual(spawn.firstCall.args[0], "powershell.exe");
      assert.deepStrictEqual(spawn.firstCall.args[1], [
        "-Command",
        '[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);Write-Output "你好 world"',
      ]);
      assert.ok(!spawn.firstCall.args[2].windowsVerbatimArguments);
    } finally {
      sandbox.restore();
    }
  });

  it("runs a CMD command with a quoted path containing spaces and Unicode", async function () {
    if (process.platform !== "win32") this.skip();
    this.timeout(10000);
    const directory = await mkdtemp(path.join(tmpdir(), "pochi background "));
    const file = path.join(directory, "你好 world.txt");
    const sandbox = sinon.createSandbox();
    try {
      await writeFile(file, "quoted path works\n");
      sandbox.stub(process, "env").value({
        ...process.env,
        ComSpec: path.join(
          process.env.SystemRoot ?? "C:\\Windows",
          "System32",
          "cmd.exe",
        ),
      });
      const child = spawnBackgroundChildProcess({
        command: `type "${file}"`,
        cwd: directory,
      });
      sandbox.restore();
      const { output, code } = await collectStdout(child);

      assert.strictEqual(code, 0);
      assert.strictEqual(output.trim(), "quoted path works");
    } finally {
      sandbox.restore();
      await rm(directory, { recursive: true, force: true });
    }
  });

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

  it("stops descendants after their shell has exited", async function () {
    if (process.platform === "win32") this.skip();
    this.timeout(10000);
    const child = spawnBackgroundChildProcess({
      command: "sleep 30 & echo $!",
      cwd: tmpdir(),
    });
    const closed = collectStdout(child);
    const exited = once(child, "exit");
    let didClose = false;
    child.once("close", () => {
      didClose = true;
    });
    try {
      assert.ok(child.stdout);
      const [output] = await once(child.stdout, "data");
      const descendantPid = Number(String(output).trim());
      assert.ok(Number.isInteger(descendantPid) && descendantPid > 0);
      await exited;
      assert.strictEqual(child.exitCode, 0);
      assert.strictEqual(didClose, false);
      assert.ok(isRunning(descendantPid));

      await terminateChildProcessTree(child);

      assert.strictEqual(isRunning(descendantPid), false);
      await closed;
    } finally {
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
      await closed;
    }
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
