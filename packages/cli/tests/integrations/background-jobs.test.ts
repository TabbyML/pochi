import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { complete, runScriptedCli, toolOutputs } from "../lib/scripted-cli";

describe.concurrent("compiled CLI background jobs", () => {
  it.skipIf(process.platform !== "darwin").each(["command", "agent"] as const)(
    "shows the %s lifecycle in a real terminal",
    async (kind) => {
      let parentRequests = 0;
      const result = await runScriptedCli(
        async (request) => {
          const users = JSON.stringify(
            request.messages.filter((message) => message.role === "user"),
          );
          if (users.includes("TTY_CHILD_PROMPT")) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            return complete("Terminal child finished.");
          }
          if (++parentRequests === 1)
            return kind === "command"
              ? [
                  {
                    name: "executeCommand",
                    input: {
                      command: "sleep 1.2; printf tty-finished",
                      background: true,
                    },
                  },
                ]
              : [
                  {
                    name: "newTask",
                    input: {
                      description: "Terminal worker",
                      prompt: "TTY_CHILD_PROMPT. Submit via attemptCompletion.",
                    },
                  },
                ];
          return complete(
            parentRequests === 2
              ? "Background work is still running."
              : "The background result has been checked.",
          );
        },
        { terminal: true },
      );
      const output = stripVTControlCharacters(result.stdout);
      await writeFile(`/tmp/pochi-interaction-${kind}-tty.log`, result.stdout);
      expect(result.exitCode, output + result.stderr).toBe(0);
      expect(result.stdout).toContain("\x1b[?25l");
      expect(output).toContain(`Started background ${kind}`);
      expect(output).toContain("Background work pending");
      expect(output).toContain("Background jobs");
      expect(output).toContain("The background result has been checked.");
      expect(output.indexOf("Task Completed")).toBeGreaterThan(
        output.indexOf("Background jobs"),
      );
    },
    25000,
  );

  it("waits for a command and sends its readable output in a completion notification", async () => {
    let jobId = "";
    let outputFile = "";
    const result = await runScriptedCli(async (request, index) => {
      if (index === 0)
        return [
          {
            name: "executeCommand",
            input: {
              command: "sleep 0.2; printf background-success",
              background: true,
            },
          },
        ];
      if (index === 1) {
        const output = toolOutputs(request).at(-1);
        jobId = output.output.match(/bgjob-cmd-[a-zA-Z0-9-]+/)[0];
        outputFile = output.output.match(/\/[^\s<>]+\.log/)[0];
        return complete("Waiting for the command.");
      }
      expect(JSON.stringify(request.messages)).toContain(jobId);
      expect(JSON.stringify(request.messages)).toContain("completed");
      expect(await readFile(outputFile, "utf8")).toBe("background-success");
      return complete("command verified");
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.requests).toHaveLength(3);
    expect(result.trajectory).toContain("command verified");
    expect(result.trajectory).toContain("data-background-job-notification");
    expect(result.stdout).toContain("Started background command");
    expect(result.stdout).toContain("Background work pending");
    expect(result.stdout).toContain("Background jobs");
    expect(result.stdout.match(/Task Completed/g)).toHaveLength(1);
    expect(result.stdout.match(/^You$/gm)).toHaveLength(1);
  }, 25000);

  it.each([
    ["nonzero exit", "printf failure-output >&2; exit 7", true, "failed", 7],
    [
      "timeout promotion",
      "printf before; sleep 1.2; printf after",
      false,
      "completed",
      0,
    ],
  ] as const)(
    "reports %s through the real CLI",
    async (_label, command, background, status, exitCode) => {
      const result = await runScriptedCli((_request, index) => {
        if (index === 0)
          return [
            {
              name: "executeCommand",
              input: { command, background, timeout: 1 },
            },
          ];
        return complete(index === 1 ? "Waiting for the job." : "job verified");
      });
      expect(result.exitCode, result.stderr).toBe(0);
      const notices = notificationParts(result.trajectory);
      expect(notices, JSON.stringify(notices, null, 2)).toHaveLength(1);
      expect(notices[0].part.data).toMatchObject({ status, exitCode });
      expect(result.stdout).toContain("Started background command");
      expect(result.stdout).toContain(`${status} with exit code ${exitCode}`);
    },
    25000,
  );

  it.each([undefined, false])(
    "returns a real subagent result (background: %s)",
    async (background) => {
      let parentRequests = 0;
      let childRequests = 0;
      const result = await runScriptedCli((request) => {
        const userMessages = JSON.stringify(
          request.messages.filter((message) => message.role === "user"),
        );
        if (userMessages.includes("CHILD_REGRESSION_PROMPT")) {
          childRequests++;
          return complete("CHILD_REGRESSION_RESULT");
        }
        parentRequests++;
        if (parentRequests === 1)
          return [
            {
              name: "newTask",
              input: {
                description: "Regression child",
                prompt:
                  "CHILD_REGRESSION_PROMPT. Submit via attemptCompletion.",
                ...(background === undefined ? {} : { background }),
              },
            },
          ];
        return complete(
          userMessages.includes("CHILD_REGRESSION_RESULT") ||
            background === false
            ? "agent verified"
            : "Waiting for the agent.",
        );
      });
      expect(result.exitCode, result.stderr).toBe(0);
      expect(childRequests).toBe(1);
      expect(result.trajectory).toContain("CHILD_REGRESSION_RESULT");
      if (background === false) {
        expect(parentRequests).toBe(2);
        expect(result.trajectory).not.toContain("bgjob-task-");
      } else {
        expect(result.trajectory).toContain("bgjob-task-");
        expect(result.trajectory).toContain("data-background-job-notification");
        expect(result.stdout).toContain("Started background agent");
        expect(result.stdout).toContain("Background agent completed");
      }
    },
    25000,
  );

  it("runs two background agents concurrently and delivers both results", async () => {
    const started = new Set<string>();
    let release!: () => void;
    const bothStarted = new Promise<void>((resolve) => {
      release = resolve;
    });
    let parentRequests = 0;
    const result = await runScriptedCli(async (request) => {
      const userMessages = JSON.stringify(
        request.messages.filter((message) => message.role === "user"),
      );
      const worker = ["ONE", "TWO"].find((name) =>
        userMessages.includes(`WORKER_${name}_PROMPT`),
      );
      if (worker) {
        started.add(worker);
        if (started.size === 2) release();
        await bothStarted;
        return complete(`WORKER_${worker}_RESULT`);
      }
      if (++parentRequests === 1)
        return ["ONE", "TWO"].map((name) => ({
          name: "newTask",
          input: {
            description: `Worker ${name}`,
            prompt: `WORKER_${name}_PROMPT. Submit via attemptCompletion.`,
          },
        }));
      return complete("parent completed");
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(started.size).toBe(2);
    const notices = notificationParts(result.trajectory);
    expect(notices.map((notice) => notice.part.data.result).sort()).toEqual([
      "WORKER_ONE_RESULT",
      "WORKER_TWO_RESULT",
    ]);
  }, 25000);

  it.each(["command", "agent"] as const)(
    "kills a background %s and its resistant child process",
    async (kind) => {
      let pid: number | undefined;
      let parentRequests = 0;
      try {
        const result = await runScriptedCli(async (request, _index, cwd) => {
          const users = JSON.stringify(
            request.messages.filter((message) => message.role === "user"),
          );
          if (users.includes("CANCEL_WORKER_PROMPT"))
            return [
              {
                name: "executeCommand",
                input: {
                  command: await resistantCommand(cwd),
                  timeout: 30,
                },
              },
            ];
          if (++parentRequests === 1)
            return kind === "command"
              ? [
                  {
                    name: "executeCommand",
                    input: {
                      command: await resistantCommand(cwd),
                      background: true,
                    },
                  },
                ]
              : [
                  {
                    name: "newTask",
                    input: {
                      description: "Cancelable worker",
                      prompt:
                        "CANCEL_WORKER_PROMPT. Submit via attemptCompletion.",
                    },
                  },
                ];
          if (parentRequests === 2) {
            pid = await waitForPid(cwd);
            const output = toolOutputs(request).at(-1);
            const backgroundJobId =
              output.backgroundJobId ??
              output.output.match(/bgjob-cmd-[a-zA-Z0-9-]+/)[0];
            return [{ name: "killBackgroundJob", input: { backgroundJobId } }];
          }
          return complete("cancellation verified");
        });
        expect(result.exitCode, result.stderr).toBe(0);
        expect(result.stdout).toContain("Stopped background job");
        expect(() => process.kill(pid!, 0)).toThrow();
        expect(
          notificationParts(result.trajectory).map(
            (notice) => notice.part.data.status,
          ),
        ).toEqual(["stopped"]);
      } finally {
        if (pid) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            /* Already exited. */
          }
        }
      }
    },
    25000,
  );

  it.each([
    { name: "zero wait", waitTimeout: 0, interrupt: false },
    { name: "wait timeout", waitTimeout: 100, interrupt: false },
    { name: "Ctrl+C", waitTimeout: 5000, interrupt: true },
  ])(
    "cleans up commands on $name",
    async ({ waitTimeout, interrupt }) => {
      let pid: number | undefined;
      try {
        const result = await runScriptedCli(
          async (_request, index, cwd) => {
            if (index === 0)
              return [
                {
                  name: "executeCommand",
                  input: {
                    command: await resistantCommand(cwd),
                    background: true,
                  },
                },
              ];
            pid = await waitForPid(cwd);
            return complete("parent finished");
          },
          { waitTimeout, signalAfterRequest: interrupt ? 2 : undefined },
        );
        expect(result.exitCode, result.stderr).toBe(interrupt ? 130 : 0);
        expect(() => process.kill(pid!, 0)).toThrow();
        if (waitTimeout === 0) expect(result.requests).toHaveLength(2);
        if (!interrupt && waitTimeout > 0) {
          expect(
            notificationParts(result.trajectory).map(
              (notice) => notice.part.data.status,
            ),
          ).toEqual(["stopped"]);
        }
      } finally {
        if (pid) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            /* Already exited. */
          }
        }
      }
    },
    25000,
  );
});

async function resistantCommand(cwd: string) {
  const scriptFile = join(cwd, "resistant.cjs");
  await writeFile(
    scriptFile,
    [
      "process.on('SIGTERM', () => {});",
      `require('node:fs').writeFileSync(${JSON.stringify(join(cwd, "pid"))}, String(process.pid));`,
      "setInterval(() => {}, 1000);",
    ].join(""),
  );
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  return `${quote(process.execPath)} ${quote(scriptFile)}; wait`;
}

function waitForPid(cwd: string) {
  return vi.waitFor(
    async () => {
      const value = await readFile(join(cwd, "pid"), "utf8");
      if (!/^\d+$/.test(value)) throw new Error("Process has not started");
      return Number.parseInt(value);
    },
    { timeout: 3000 },
  );
}

function notificationParts(trajectory: string) {
  // Trajectories contain updates: inserting text can move a notification from
  // index 0 to index 1. Reconstruct the final parts before checking delivery.
  const parts = new Map<
    string,
    { part: { type: string; data: Record<string, unknown> } }
  >();
  for (const line of trajectory
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))) {
    if (line.type === "message-part")
      parts.set(`${line.messageId}:${line.index}`, line);
  }
  return [...parts.values()].filter(
    (line) => line.part.type === "data-background-job-notification",
  );
}
