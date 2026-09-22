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

describe("monitor notification rendering", () => {
  const monitor = {
    kind: "monitor" as const,
    notificationId: "monitor:batch-1",
    backgroundJobId: "bgjob-monitor-1",
    description: 'Watch <build> & "tests"',
    command: "watch --filter '<build>'",
    outputFile: "/tmp/watch.log",
    lines: ["<error>build & test</error>", "next line"],
    omittedLines: 12,
  };

  it("uses the shared envelope and escapes incremental output without claiming completion", () => {
    const text = renderBackgroundJobNotification(monitor);
    expect(text.startsWith("<background-job-notification>\n")).toBe(true);
    expect(text.endsWith("</background-job-notification>")).toBe(true);
    expect(text).toContain("<notification-id>monitor:batch-1</notification-id>");
    expect(text).toContain("<background-job-id>bgjob-monitor-1</background-job-id>");
    expect(text).toContain("<kind>monitor</kind>");
    expect(text).toContain("<status>running</status>");
    expect(text).toContain("Watch &lt;build&gt; &amp; &quot;tests&quot;");
    expect(text).toContain("watch --filter &apos;&lt;build&gt;&apos;");
    expect(text).toContain("&lt;error&gt;build &amp; test&lt;/error&gt;\nnext line");
    expect(text).toContain("12 monitor events omitted");
    expect(text).toContain("automated notification, not user input");
    expect(text).toContain("not a final result");
    expect(text).not.toContain("status above is final");
  });

  it.each(["completed", "failed", "stopped"] as const)(
    "keeps final output and the %s end state in one notification",
    (status) => {
      const text = renderBackgroundJobNotification({
        ...monitor,
        ended: { status, reason: "stopped <by owner>", exitCode: 7 },
      });
      expect(text).toContain(`<status>${status}</status>`);
      expect(text).toContain("next line</events>");
      expect(text).toContain("<end-reason>stopped &lt;by owner&gt;</end-reason>");
      expect(text).toContain("<exit-code>7</exit-code>");
      expect(text).toContain("The monitor has ended");
      expect(text).not.toContain("may produce more events");
    },
  );

});
