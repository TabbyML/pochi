import type { BackgroundJobNotification } from "@getpochi/common";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageNotifications } from "../background-job-notifications";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "backgroundJobNotifications.title") {
        return "Notifications";
      }
      return key;
    },
  }),
}));
vi.mock("@/components/ui/collapsible-section", () => ({
  CollapsibleSection: ({
    title,
    actions,
    children,
  }: {
    title: React.ReactNode;
    actions: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <section>
      <header>
        {title}
        {actions}
      </header>
      {children}
    </section>
  ),
}));
vi.mock("@/features/tools", () => ({
  BackgroundJobPanel: ({
    backgroundJobId,
    command,
    summary,
    status,
    outputFile,
    appearance,
  }: {
    backgroundJobId: string;
    command?: string;
    summary?: string;
    status?: string;
    outputFile?: string;
    appearance?: string;
  }) => (
    <div
      data-testid="background-job-panel"
      data-background-job-id={backgroundJobId}
      data-status={status}
      data-output-file={outputFile}
      data-appearance={appearance}
    >
      <span>{command}</span>
      <span>{summary}</span>
    </div>
  ),
}));
vi.mock("../subagent-results", () => ({
  SubagentResultNotificationItem: ({
    result,
  }: {
    result: {
      taskId: string;
      title: string;
    };
  }) => (
    <div data-testid="subagent-notification" data-task-id={result.taskId}>
      {result.title}
    </div>
  ),
}));
describe("MessageNotifications", () => {
  it("groups mixed parts in order, counting individual subagent results", () => {
    const { container, getByText } = render(
      <MessageNotifications
        parts={[
          { type: "text", text: "User message stays outside notifications" },
          {
            type: "data-background-job-notification",
            data: notification("bgjob-cmd-1", "completed"),
          },
          {
            type: "data-background-job-notification",
            data: {
              kind: "subagent",
              notificationId: "bgjob-task-" + "child-1" + ":terminal:1",
              backgroundJobId: "bgjob-task-" + "child-1",
              taskId: "child-1",
              title: "Research",
              status: "completed",
              result: "done",
            },
          },
          {
            type: "data-background-job-notification",
            data: {
              kind: "subagent",
              notificationId: "bgjob-task-" + "child-2" + ":terminal:1",
              backgroundJobId: "bgjob-task-" + "child-2",
              taskId: "child-2",
              title: "Review",
              status: "failed",
              result: "failed",
            },
          },
          {
            type: "data-background-job-notification",
            data: notification("bgjob-cmd-2", "failed"),
          },
          {
            type: "data-background-job-notification",
            data: {
              kind: "subagent",
              notificationId: "bgjob-task-" + "child-3" + ":terminal:1",
              backgroundJobId: "bgjob-task-" + "child-3",
              taskId: "child-3",
              title: "Follow-up",
              status: "completed",
              result: "done",
            },
          },
        ]}
      />,
    );
    expect(container.querySelectorAll("section")).toHaveLength(1);
    expect(getByText("5").getAttribute("data-slot")).toBe("badge");
    expect(
      [...container.querySelectorAll("[data-testid]")].map(
        (node) =>
          node.getAttribute("data-task-id") ??
          node.getAttribute("data-background-job-id"),
      ),
    ).toEqual(["bgjob-cmd-1", "child-1", "child-2", "bgjob-cmd-2", "child-3"]);
    expect(container.textContent).not.toContain(
      "User message stays outside notifications",
    );
  });
  it("renders no group for messages without notifications", () => {
    const { container } = render(
      <MessageNotifications parts={[{ type: "text", text: "Hello" }]} />,
    );
    expect(container.innerHTML).toBe("");
  });
  it("groups notifications under one data-style section", () => {
    const { container, getAllByTestId, getByText } = render(
      <MessageNotifications
        parts={[
          notification("bgjob-cmd-1", "completed"),
          notification("bgjob-cmd-2", "failed"),
        ].map((data) => ({
          type: "data-background-job-notification" as const,
          data,
        }))}
      />,
    );
    expect(container.querySelectorAll("section")).toHaveLength(1);
    expect(getByText("Notifications")).toBeDefined();
    expect(getByText("2").getAttribute("data-slot")).toBe("badge");
    expect(getAllByTestId("background-job-panel")).toHaveLength(2);
    expect(
      getAllByTestId("background-job-panel")[0]?.getAttribute(
        "data-appearance",
      ),
    ).toBe("notification");
    expect(getByText("run bgjob-cmd-1")).toBeDefined();
    expect(getByText("run bgjob-cmd-2")).toBeDefined();
    expect(getByText("bgjob-cmd-1 completed")).toBeDefined();
    expect(getByText("bgjob-cmd-2 failed")).toBeDefined();
    expect(container.textContent).not.toContain("Job 1");
    expect(container.textContent).not.toContain("Job 2");
  });
});
function notification(
  backgroundJobId: string,
  status: BackgroundJobNotification["status"],
): BackgroundJobNotification {
  return {
    kind: "command",
    notificationId: `${backgroundJobId}:terminal`,
    backgroundJobId,
    outputFile: `/tmp/${backgroundJobId}.log`,
    command: `run ${backgroundJobId}`,
    status,
    summary: `${backgroundJobId} ${status}`,
    exitCode: status === "completed" ? 0 : 7,
    finishedAt: 1,
  };
}
