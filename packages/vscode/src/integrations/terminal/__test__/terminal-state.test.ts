import * as assert from "node:assert";
import type { BackgroundCommands } from "@getpochi/common/vscode-webui-bridge";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";

describe("TerminalState monitor control", () => {
  it("lists and stops shell monitors while retaining PTY close behavior", () => {
    const stopped: string[] = [];
    const jobs = [
      { id: "shell-monitor", isPtyTerminal: false, monitorDescription: "CI", isFinished: false },
      { id: "pty-command", isPtyTerminal: true, monitorDescription: undefined, isFinished: false },
      { id: "shell-command", isPtyTerminal: false, monitorDescription: undefined, isFinished: false },
      { id: "ended-monitor", isPtyTerminal: false, monitorDescription: "done", isFinished: true },
    ].map((job) => ({
      ...job, taskId: "owner", command: "watch", outputFile: `/tmp/${job.id}.log`, isVisible: false,
      kill: () => stopped.push(`kill:${job.id}`),
      closePtyProcess: () => stopped.push(`close:${job.id}`),
    }));
    const { TerminalState } = proxyquire.noCallThru().load("../terminal-state", {
      "./terminal-job": { TerminalJob: { list: () => jobs, get: (id: string) => jobs.find((job) => job.id === id) } },
    }) as typeof import("../terminal-state");
    const state = Object.create(TerminalState.prototype) as InstanceType<typeof TerminalState>;
    const snapshot = (state as unknown as { listBackgroundCommands(): BackgroundCommands }).listBackgroundCommands();
    assert.deepStrictEqual(Object.keys(snapshot), ["shell-monitor", "pty-command"]);
    assert.strictEqual(snapshot["shell-monitor"].monitor, "CI");
    assert.strictEqual(snapshot["shell-monitor"].taskId, "owner");
    for (const job of jobs) state.closeBackgroundCommand(job.id);
    assert.deepStrictEqual(stopped, ["kill:shell-monitor", "close:pty-command"]);
  });
});
