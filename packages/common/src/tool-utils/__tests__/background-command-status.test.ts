import { describe, expect, it } from "vitest";
import {
  BackgroundCommandRunningHint,
  parseBackgroundCommandOutputFilePath,
  prependBackgroundCommandRunningHint,
} from "../background-command-status";

describe("parseBackgroundCommandOutputFilePath", () => {
  it("recognizes managed command transcripts", () => {
    expect(
      parseBackgroundCommandOutputFilePath(
        "/home/u/.pochi/tasks/t1/background-jobs/bgjob-cmd-abc123.log",
      ),
    ).toBe("bgjob-cmd-abc123");
    expect(
      parseBackgroundCommandOutputFilePath(
        "pochi://~/tasks/t1/pochi-background-jobs/bgjob-cmd-abc123.log",
      ),
    ).toBe("bgjob-cmd-abc123");
  });

  it("ignores jobs that are not commands", () => {
    expect(
      parseBackgroundCommandOutputFilePath(
        "/home/u/.pochi/tasks/t1/background-jobs/bgjob-task-abc123.log",
      ),
    ).toBeUndefined();
    expect(
      parseBackgroundCommandOutputFilePath(
        "/home/u/.pochi/tasks/t1/background-jobs/bgjob-monitor-abc123.log",
      ),
    ).toBeUndefined();
  });

  it("ignores terminal transcripts and ordinary files", () => {
    expect(
      parseBackgroundCommandOutputFilePath(
        "/home/u/.pochi/terminals/term-abc123.log",
      ),
    ).toBeUndefined();
    expect(
      parseBackgroundCommandOutputFilePath("/home/u/project/server.log"),
    ).toBeUndefined();
  });
});

describe("prependBackgroundCommandRunningHint", () => {
  it("puts the hint before the transcript", () => {
    expect(prependBackgroundCommandRunningHint("tick")).toBe(
      `${BackgroundCommandRunningHint}\n\ntick`,
    );
    expect(prependBackgroundCommandRunningHint("tick\n")).toBe(
      `${BackgroundCommandRunningHint}\n\ntick\n`,
    );
  });

  it("reports liveness for an empty transcript", () => {
    expect(prependBackgroundCommandRunningHint("")).toBe(
      BackgroundCommandRunningHint,
    );
  });
});
