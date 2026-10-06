import { describe, expect, it } from "vitest";
import { assertMonitorCommandAllowed } from "..";

describe("assertMonitorCommandAllowed", () => {
  it.each([
    "tail -f /Users/me/.pochi/tasks/t/background-jobs/bgjob-cmd-5bb348a8-c5ab-4885-bb95-713938a3cde3.log",
    "grep --line-buffered FAIL bgjob-task-abc.log",
    "tail -f ~/.pochi/tasks/t/background-jobs/bgjob-monitor-1.log",
  ])("rejects a monitor that watches a managed job: %s", (command) => {
    expect(() => assertMonitorCommandAllowed(command)).toThrow(
      /You are notified automatically when it finishes/,
    );
  });

  it("allows monitors on other sources", () => {
    expect(() =>
      assertMonitorCommandAllowed(
        'tail -f app.log | grep -E --line-buffered "ERROR|FAILED"',
      ),
    ).not.toThrow();
  });
});
