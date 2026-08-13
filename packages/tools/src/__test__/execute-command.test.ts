import { describe, expect, it } from "vitest";
import { createBackgroundCommandResult } from "../execute-command";

describe("createBackgroundCommandResult", () => {
  it("describes the job ID and output file in the public output", () => {
    const result = createBackgroundCommandResult(
      "bgjob-cmd-test",
      "/tmp/bgjob-cmd-test.log",
    );

    expect(result.output).toContain("bgjob-cmd-test");
    expect(result.output).toContain("/tmp/bgjob-cmd-test.log");
    expect(result._meta).toEqual({ backgroundJobId: "bgjob-cmd-test" });
  });
});
