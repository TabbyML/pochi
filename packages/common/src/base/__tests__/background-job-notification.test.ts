import { describe, expect, it } from "vitest";
import { renderBackgroundJobNotification } from "../prompts/background-job-notification";

describe("renderBackgroundJobNotification", () => {
  it("directs the agent to read output after the final status arrives", () => {
    const prompt = renderBackgroundJobNotification({
      notificationId: "notification-1",
      backgroundJobId: "bgjob-cmd-test",
      outputFile: "/tmp/bgjob-cmd-test.log",
      command: "false",
      status: "failed",
      summary: 'Background command "false" failed with exit code 1',
      exitCode: 1,
      finishedAt: 1,
    });

    expect(prompt).toContain("<status>failed</status>");
    expect(prompt).toContain(
      "<output-file>/tmp/bgjob-cmd-test.log</output-file>",
    );
    expect(prompt).toContain("Read the output file");
    expect(prompt).toContain("status above is final");
  });
});
