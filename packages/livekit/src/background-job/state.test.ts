import type { BackgroundJobNotification } from "@getpochi/common";
import { describe, expect, it } from "vitest";
import type { Message, Task } from "../types";
import { buildBackgroundJobList } from "./state";
describe("buildBackgroundJobList", () => {
    it("lists a command the host still has a process for as running", () => {
        const backgroundJobs = buildBackgroundJobList({
            messages: [message([executeCommandPart("bgjob-cmd-1", "bun run dev")])],
            notifications: [],
            backgroundCommands: { "bgjob-cmd-1": { isVisible: true } },
        });
        expect(backgroundJobs).toEqual([
            {
                backgroundJobId: "bgjob-cmd-1",
                displayId: "%1",
                title: "bun run dev",
                command: "bun run dev",
                status: "running",
                outputFile: "/tmp/bgjob-cmd-1.log",
            }
        ]);
    });
    it("keeps a finished job whose notification was already delivered", () => {
        const backgroundJobs = buildBackgroundJobList({
            messages: [
                message([
                    executeCommandPart("bgjob-cmd-1", "bun run dev"),
                    notificationPart(notification("bgjob-cmd-1", "failed"))
                ])
            ],
            notifications: [],
            backgroundCommands: {},
        });
        expect(backgroundJobs).toEqual([
            {
                backgroundJobId: "bgjob-cmd-1",
                displayId: "%1",
                title: "bun run dev",
                command: "bun run dev",
                status: "failed",
                outputFile: "/tmp/bgjob-cmd-1.log",
            }
        ]);
    });
    it("keeps a finished job whose notification is still undelivered", () => {
        const backgroundJobs = buildBackgroundJobList({
            messages: [message([executeCommandPart("bgjob-cmd-1", "bun run dev")])],
            notifications: [notification("bgjob-cmd-1", "completed")],
            backgroundCommands: {},
        });
        expect(backgroundJobs).toMatchObject([
            { backgroundJobId: "bgjob-cmd-1", status: "completed" }
        ]);
    });
    it("carries the exit code a finished job reported", () => {
        const backgroundJobs = buildBackgroundJobList({
            messages: [message([executeCommandPart("bgjob-cmd-1", "bun run dev")])],
            notifications: [notification("bgjob-cmd-1", "failed", 127)],
            backgroundCommands: {},
        });
        expect(backgroundJobs).toMatchObject([
            { status: "failed", exitCode: 127 }
        ]);
    });
    it("still lists a gone command nothing reported an ending for", () => {
        const backgroundJobs = buildBackgroundJobList({
            messages: [message([executeCommandPart("bgjob-cmd-1", "bun run dev")])],
            notifications: [],
            backgroundCommands: {},
        });
        expect(backgroundJobs).toMatchObject([
            {
                backgroundJobId: "bgjob-cmd-1",
                status: "finished",
                exitCode: undefined,
                outputFile: "/tmp/bgjob-cmd-1.log",
            }
        ]);
    });
    it("lists a command promoted from the foreground, background flag or not", () => {
        const backgroundJobs = buildBackgroundJobList({
            messages: [
                message([
                    {
                        ...executeCommandPart("bgjob-cmd-1", "bun run dev"),
                        input: { command: "bun run dev" },
                    }
                ])
            ],
            notifications: [],
            backgroundCommands: { "bgjob-cmd-1": { isVisible: false } },
        });
        expect(backgroundJobs).toMatchObject([
            { status: "running", title: "bun run dev" }
        ]);
    });
    it("surfaces a notification whose executeCommand part is gone", () => {
        const backgroundJobs = buildBackgroundJobList({
            messages: [],
            notifications: [notification("bgjob-cmd-9", "stopped")],
            backgroundCommands: {},
        });
        expect(backgroundJobs).toEqual([
            {
                backgroundJobId: "bgjob-cmd-9",
                title: "run bgjob-cmd-9",
                command: "run bgjob-cmd-9",
                status: "stopped",
                outputFile: "/tmp/bgjob-cmd-9.log",
            }
        ]);
    });
    it("lists the newest job first, numbered like the badges in the message list", () => {
        const backgroundJobs = buildBackgroundJobList({
            messages: [
                message([
                    executeCommandPart("bgjob-cmd-1", "first"),
                    executeCommandPart("bgjob-cmd-2", "second")
                ])
            ],
            notifications: [
                notification("bgjob-cmd-1", "completed"),
                notification("bgjob-cmd-2", "completed"),
                notification("bgjob-cmd-9", "completed")
            ],
            backgroundCommands: {},
        });
        expect(backgroundJobs.map((job) => job.displayId)).toEqual([
            "%2",
            "%1",
            undefined
        ]);
    });
    it("falls back to what the notifications know while the host table loads", () => {
        const backgroundJobs = buildBackgroundJobList({
            messages: [
                message([
                    executeCommandPart("bgjob-cmd-1", "bun run dev"),
                    executeCommandPart("bgjob-cmd-2", "bun run build"),
                    notificationPart(notification("bgjob-cmd-2", "completed"))
                ])
            ],
            notifications: [],
            backgroundCommands: undefined,
        });
        expect(backgroundJobs.map((job) => job.status)).toEqual([
            "completed",
            "finished"
        ]);
    });
});
function message(parts: unknown[]): Message {
    return { id: "message-1", role: "assistant", parts } as unknown as Message;
}
function executeCommandPart(backgroundJobId: string, command: string) {
    return {
        type: "tool-executeCommand",
        state: "output-available",
        input: { command, background: true },
        output: {
            _meta: { backgroundJobId, outputFile: `/tmp/${backgroundJobId}.log` },
        },
    };
}
function notificationPart(data: BackgroundJobNotification) {
    return { type: "data-background-job-notification", data };
}
function notification(backgroundJobId: string, status: BackgroundJobNotification["status"], exitCode?: number): BackgroundJobNotification {
    return {
        kind: "command",
    notificationId: `${backgroundJobId}:terminal`,
        backgroundJobId,
        outputFile: `/tmp/${backgroundJobId}.log`,
        command: `run ${backgroundJobId}`,
        status,
        exitCode,
        summary: `Background command "${backgroundJobId}" ${status}`,
        finishedAt: 1,
    };
}
describe("background subagents", () => {
    it("keeps finished subagents, distinguishes stops, and tracks notification delivery", () => {
        const subTasks = [
            { id: "running", title: "Review", background: true, status: "pending-model" },
            { id: "stopped", title: "Cancelled", background: true, status: "failed", error: { kind: "AbortError" } },
            { id: "done", title: "Done", background: true, status: "completed" },
            { id: "foreground", background: false, status: "completed" }
        ] as unknown as Task[];
        const jobs = buildBackgroundJobList({ subTasks, notifications: [], backgroundCommands: {}, messages: [message([{
                        type: "data-background-job-notification",
                        data: { kind: "subagent", notificationId: "bgjob-task-" + "done" + ":terminal:completed", backgroundJobId: "bgjob-task-" + "done", taskId: "done", status: "completed", result: "done" }
                    }])] });
        expect(jobs).toHaveLength(3);
        expect(jobs[0]).toMatchObject({ backgroundJobId: "bgjob-task-running", taskId: "running", status: "running", notificationPending: false });
        expect(jobs[1]).toMatchObject({ status: "stopped", notificationPending: true });
        expect(jobs[2]).toMatchObject({ status: "completed", notificationPending: false });
    });
});

it("uses each newTask description for untitled agents instead of exposing job IDs", () => {
  const jobs = buildBackgroundJobList({
    subTasks: [{ id: "first", title: null, background: true, status: "pending-model" }, { id: "second", title: null, background: true, status: "pending-model" }] as Task[],
    notifications: [], backgroundCommands: {},
    messages: [message([
      { type: "tool-newTask", state: "output-available", input: { agentType: "explore", description: "Inspect structure", _meta: { uid: "first" } } },
      { type: "tool-newTask", state: "output-available", input: { agentType: "explore", description: "Inspect tests", _meta: { uid: "second" } } },
    ])],
  });
  expect(jobs.map(({ agentType, title }) => ({ agentType, title }))).toEqual([
    { agentType: "explore", title: "Inspect structure" },
    { agentType: "explore", title: "Inspect tests" },
  ]);
});
