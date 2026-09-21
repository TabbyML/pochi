import * as assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { MonitorEventEnvelope } from "@getpochi/common";
import { describe, it } from "mocha";
import * as vscode from "vscode";
import proxyquire from "proxyquire";

// Keep the command, PTY, transcript and monitor pipeline real; isolate editor layout.
const { TerminalJob } = proxyquire
  .noCallThru()
  .load("../../integrations/terminal/terminal-job", {
    "../layout": { createTerminal: vscode.window.createTerminal },
  }) as typeof import("../../integrations/terminal/terminal-job");
const { startMonitor } = proxyquire.noCallThru().load("../monitor", {
  "@/integrations/layout": { getViewColumnForTerminal: () => undefined },
  "@/integrations/terminal/terminal-job": { TerminalJob },
}) as typeof import("../monitor");

describe("startMonitor real terminal", () => {
  for (const mode of ["timeout", "manual", "graceful"] as const) {
    it(`cleans up descendants after the shell exits during ${mode} cancellation`, async function () {
      if (process.platform === "win32") this.skip();
      this.timeout(15000);
      const dir = await mkdtemp(path.join(tmpdir(), "pochi-monitor-group-"));
      const taskId = `monitor-test-${crypto.randomUUID()}`;
      const pidFile = path.join(dir, "child.pid");
      const cleanedFile = path.join(dir, "cleaned");
      const script = path.join(dir, "child.sh");
      await writeFile(
        script,
        [
          "trap '' HUP",
          mode === "graceful"
            ? "trap 'sleep 0.2; echo cleaned > \"$POCHI_MONITOR_CLEANED\"; exit 0' TERM"
            : "trap '' TERM",
          'echo $$ > "$POCHI_MONITOR_PID"',
          "while :; do sleep 1; done",
        ].join("\n"),
      );
      const events: MonitorEventEnvelope[] = [];
      const subscription = TerminalJob.onDidMonitorEvent((item) => {
        if (item.taskId === taskId) events.push(item.event);
      });
      let result: Awaited<ReturnType<typeof startMonitor>> | undefined;
      let groupId: number | undefined;
      try {
        result = await startMonitor(
          {
            command: 'sh "$POCHI_MONITOR_SCRIPT" >/dev/null 2>&1 & wait',
            description: `${mode} cleanup`,
            timeoutMs: 1000,
            persistent: mode !== "timeout",
          },
          {
            cwd: dir,
            taskId,
            toolCallId: "monitor",
            messages: [],
            envs: {
              POCHI_MONITOR_SCRIPT: script,
              POCHI_MONITOR_PID: pidFile,
              POCHI_MONITOR_CLEANED: cleanedFile,
            },
          },
        );
        let childPid = 0;
        await waitUntil(async () => {
          childPid = Number(await readFile(pidFile, "utf8").catch(() => "0"));
          return childPid > 0;
        });
        groupId = Number(
          execFileSync("ps", ["-p", String(childPid), "-o", "pgid="], {
            encoding: "utf8",
          }).trim(),
        );
        assert.ok(groupId > 0);
        assert.ok(isRunning(childPid));
        if (mode !== "timeout") {
          const job = TerminalJob.get(result.backgroundJobId);
          assert.ok(job);
          job.kill();
          job.kill();
        }
        await waitUntil(() => events.some((event) => !!event.ended));
        await waitUntil(() => !isRunning(childPid));
        assert.strictEqual(events.filter((event) => event.ended).length, 1);
        assert.strictEqual(events.at(-1)?.ended?.status, "stopped");
        assert.strictEqual(TerminalJob.get(result.backgroundJobId), undefined);
        if (mode === "graceful") {
          assert.strictEqual(
            (await readFile(cleanedFile, "utf8")).trim(),
            "cleaned",
          );
        }
      } finally {
        // Also clean up when running the regression against the broken code.
        if (groupId) {
          try {
            process.kill(-groupId, "SIGKILL");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
          }
        }
        if (result) {
          TerminalJob.get(result.backgroundJobId)?.kill();
          await waitUntil(() => !TerminalJob.get(result!.backgroundJobId));
          await rm(path.dirname(path.dirname(result.outputFile)), {
            recursive: true,
            force: true,
          });
        }
        subscription.dispose();
        await rm(dir, { recursive: true, force: true });
      }
    });
  }

  it("streams events before exit and retains the full transcript", async function () {
    if (process.platform === "win32") this.skip();
    this.timeout(15000);
    const taskId = `monitor-test-${crypto.randomUUID()}`;
    const events: MonitorEventEnvelope[] = [];
    let resolveFirst!: () => void;
    let resolveEnd!: () => void;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const ended = new Promise<void>((resolve) => {
      resolveEnd = resolve;
    });
    const subscription = TerminalJob.onDidMonitorEvent((item) => {
      if (item.taskId !== taskId) return;
      events.push(item.event);
      if (item.event.lines.length) resolveFirst();
      if (item.event.ended) resolveEnd();
    });
    let result: Awaited<ReturnType<typeof startMonitor>> | undefined;
    try {
      result = await startMonitor(
        {
          command: "printf 'ready\\n'; sleep 1; printf 'done\\n'",
          description: "real monitor",
          timeoutMs: 3000,
        },
        {
          cwd: process.cwd(),
          taskId,
          toolCallId: "monitor",
          messages: [],
          abortSignal: new AbortController().signal,
        },
      );
      assert.match(result.backgroundJobId, /^bgjob-monitor-/);
      await first;
      assert.ok(TerminalJob.get(result.backgroundJobId));
      await ended;
      assert.deepStrictEqual(
        events.flatMap((event) => event.lines),
        ["ready", "done"],
      );
      assert.strictEqual(events.at(-1)?.ended?.status, "completed");
      const output = new TextDecoder().decode(
        await vscode.workspace.fs.readFile(vscode.Uri.file(result.outputFile)),
      );
      assert.ok(output.includes("ready") && output.includes("done"));
      assert.strictEqual(TerminalJob.get(result.backgroundJobId), undefined);
    } finally {
      if (result) {
        if (TerminalJob.get(result.backgroundJobId)) {
          TerminalJob.get(result.backgroundJobId)?.kill();
          await ended;
        }
        await vscode.workspace.fs.delete(
          vscode.Uri.file(path.dirname(path.dirname(result.outputFile))),
          { recursive: true, useTrash: false },
        );
      }
      subscription.dispose();
    }
  });
});

async function waitUntil(condition: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 6000;
  while (!(await condition())) {
    assert.ok(Date.now() < deadline, "Timed out waiting for monitor cleanup");
    await delay(25);
  }
}

function isRunning(pid: number) {
  try {
    const status = execFileSync("ps", ["-p", String(pid), "-o", "stat="], {
      encoding: "utf8",
    }).trim();
    return status.length > 0 && !status.startsWith("Z");
  } catch {
    return false;
  }
}
