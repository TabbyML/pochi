import { describe, expect, it } from "vitest";
import { createBackgroundCommandResult } from "../execute-command";

describe("createBackgroundCommandResult", () => {
  it("provides the output path without treating it as a status signal", () => {
    const result = createBackgroundCommandResult(
      "bgjob-cmd-test",
      "/tmp/bgjob-cmd-test.log",
    );

    expect(result.output).toContain('Job ID: "bgjob-cmd-test"');
    expect(result.output).toContain(
      'Output file: "/tmp/bgjob-cmd-test.log"',
    );
    expect(result.output).toContain(
      "not that it completed successfully",
    );
    expect(result.output).toContain(
      "The output file contains command output only",
    );
    expect(result.output).toContain("does not contain the job's status");
    expect(result.output).toContain("do not poll the file for completion");
    expect(result.output).toContain("yield the current turn");
    expect(result._meta).toEqual({
      backgroundJobId: "bgjob-cmd-test",
      outputFile: "/tmp/bgjob-cmd-test.log",
    });
  });

  it("prevents retrying a foreground command promoted after timeout", () => {
    const result = createBackgroundCommandResult(
      "bgjob-cmd-test",
      "/tmp/bgjob-cmd-test.log",
      { origin: "foreground-timeout" },
    );

    expect(result.output).toContain("The foreground command timed out");
    expect(result.output).toContain(
      "its original process is still running in the background",
    );
    expect(result.output).toContain(
      "Do not retry the command in the foreground",
    );
    expect(result.output).toContain(
      "Wait for the completion notification instead",
    );
  });
});
