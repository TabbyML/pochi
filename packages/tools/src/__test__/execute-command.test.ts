import { describe, expect, it } from "vitest";
import { createBackgroundCommandResult } from "../execute-command";

describe("createBackgroundCommandResult", () => {
  it("provides the output path without treating it as a status signal", () => {
    const result = createBackgroundCommandResult(
      "bgjob-cmd-test",
      "/tmp/bgjob-cmd-test.log",
    );

    expect(result.output).toContain("bgjob-cmd-test");
    expect(result.output).toContain("/tmp/bgjob-cmd-test.log");
    expect(result.output).toContain("Do not infer job status");
    expect(result.output).toContain("read the output file if needed");
    expect(result._meta).toEqual({
      backgroundJobId: "bgjob-cmd-test",
      outputFile: "/tmp/bgjob-cmd-test.log",
    });
  });
});
