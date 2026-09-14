import * as assert from "node:assert";
import path from "node:path";
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
