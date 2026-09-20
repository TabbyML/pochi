import { describe, expect, it } from "vitest";
import { renderBackgroundJobNotification } from "../prompts/background-job-notification";

describe("renderBackgroundJobNotification", () => {
  it("directs the agent to read output after the final status arrives", () => {
    const prompt = renderBackgroundJobNotification({
      kind: "command",
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

it("uses the same envelope and explicit stopped status for subagents", () => {
  const prompt = renderBackgroundJobNotification({
    kind: "subagent", notificationId: "bgjob-task-child:terminal:2", backgroundJobId: "bgjob-task-child", taskId: "child", status: "stopped", result: "Stopped <by user> & done",
  });
  expect(prompt).toContain("<background-job-notification>");
  expect(prompt).toContain("<kind>subagent</kind>");
  expect(prompt).toContain("<status>stopped</status>");
  expect(prompt).toContain("<result>Stopped &lt;by user&gt; &amp; done</result>");
  expect(prompt).toContain("automated notification, not user input");
  expect(prompt).not.toContain("output-file");
  expect(prompt).not.toContain("finished-at");
});
