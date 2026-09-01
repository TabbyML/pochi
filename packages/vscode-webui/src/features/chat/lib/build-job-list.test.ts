import type { BackgroundJobNotification } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import { describe, expect, it } from "vitest";
import { type TerminalSnapshot, buildJobList } from "./build-job-list";

describe("buildJobList", () => {
  it("lists a running job from its live terminal", () => {
    const { pochi } = buildJobList({
      messages: [message([executeCommandPart("bgjob-cmd-1", "bun run dev")])],
      notifications: [],
      terminals: [terminal("bgjob-cmd-1", { isActive: true })],
    });

    expect(pochi).toEqual([
      {
        backgroundJobId: "bgjob-cmd-1",
        displayId: "%1",
        title: "bun run dev",
        command: "bun run dev",
        status: "running",
        outputFile: "/tmp/bgjob-cmd-1.log",
        isActive: true,
      },
    ]);
  });

  it("keeps a finished job whose notification was already delivered", () => {
    const { pochi } = buildJobList({
      messages: [
        message([
          executeCommandPart("bgjob-cmd-1", "bun run dev"),
          notificationPart(notification("bgjob-cmd-1", "failed")),
        ]),
      ],
      // The host copy is dropped once it has been delivered as a message part.
      notifications: [],
      terminals: [],
    });

    expect(pochi).toEqual([
      {
        backgroundJobId: "bgjob-cmd-1",
        displayId: "%1",
        title: "bun run dev",
        command: "bun run dev",
        status: "failed",
        outputFile: "/tmp/bgjob-cmd-1.log",
        isActive: false,
      },
    ]);
  });

  it("keeps a finished job whose notification is still undelivered", () => {
    const { pochi } = buildJobList({
      messages: [message([executeCommandPart("bgjob-cmd-1", "bun run dev")])],
      notifications: [notification("bgjob-cmd-1", "completed")],
      terminals: [],
    });

    expect(pochi).toMatchObject([
      { backgroundJobId: "bgjob-cmd-1", status: "completed" },
    ]);
  });

  it("surfaces a notification whose executeCommand part is gone", () => {
    const { pochi } = buildJobList({
      messages: [],
      notifications: [notification("bgjob-cmd-9", "stopped")],
      terminals: [],
    });

    expect(pochi).toEqual([
      {
        backgroundJobId: "bgjob-cmd-9",
        title: "run bgjob-cmd-9",
        command: "run bgjob-cmd-9",
        status: "stopped",
        outputFile: "/tmp/bgjob-cmd-9.log",
        isActive: false,
      },
    ]);
  });

  it("drops a job that has neither a terminal nor a notification", () => {
    const { pochi } = buildJobList({
      messages: [message([executeCommandPart("bgjob-cmd-1", "bun run dev")])],
      notifications: [],
      terminals: [],
    });

    expect(pochi).toEqual([]);
  });

  it("lists the newest job first, numbered like the badges in the message list", () => {
    const { pochi } = buildJobList({
      messages: [
        message([
          executeCommandPart("bgjob-cmd-1", "first"),
          executeCommandPart("bgjob-cmd-2", "second"),
        ]),
      ],
      notifications: [
        notification("bgjob-cmd-1", "completed"),
        notification("bgjob-cmd-2", "completed"),
        // Started before both, but its message was compacted away.
        notification("bgjob-cmd-9", "completed"),
      ],
      terminals: [],
    });

    expect(pochi.map((job) => job.displayId)).toEqual(["%2", "%1", undefined]);
  });

  it("hides running jobs until the terminal list has loaded", () => {
    const { pochi } = buildJobList({
      messages: [message([executeCommandPart("bgjob-cmd-1", "bun run dev")])],
      notifications: [],
      terminals: undefined,
    });

    expect(pochi).toEqual([]);
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
    output: { _meta: { backgroundJobId } },
  };
}

function notificationPart(data: BackgroundJobNotification) {
  return { type: "data-background-job-notification", data };
}

function terminal(
  backgroundJobId: string,
  {
    name = "zsh",
    isActive = false,
  }: {
    name?: string;
    isActive?: boolean;
  } = {},
): TerminalSnapshot {
  return {
    name,
    isActive,
    backgroundJobId,
    outputFile: `/tmp/${backgroundJobId}.log`,
  };
}

function notification(
  backgroundJobId: string,
  status: BackgroundJobNotification["status"],
): BackgroundJobNotification {
  return {
    notificationId: `${backgroundJobId}:terminal`,
    backgroundJobId,
    outputFile: `/tmp/${backgroundJobId}.log`,
    command: `run ${backgroundJobId}`,
    status,
    summary: `Background command "${backgroundJobId}" ${status}`,
    finishedAt: 1,
  };
}
