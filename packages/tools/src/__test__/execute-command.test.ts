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
});
