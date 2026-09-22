import type {
  BackgroundCommandNotification,
  BackgroundMonitorNotification,
} from "@getpochi/common";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  BackgroundJobNotifications,
  MessageNotifications,
} from "../background-job-notifications";
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
    notificationTitle,
    notificationEvents,
  }: {
    backgroundJobId: string;
    command?: string;
    summary?: string;
    status?: string;
    outputFile?: string;
    appearance?: string;
    notificationTitle?: string;
    notificationEvents?: { id: string; text: string }[];
  }) => (
    <div
      data-testid="background-job-panel"
      data-background-job-id={backgroundJobId}
      data-status={status}
      data-output-file={outputFile}
      data-appearance={appearance}
    >
      <span>{notificationTitle ?? command}</span>
      <span>
        {notificationEvents?.map((event) => event.text).join("\n") ?? summary}
      </span>
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
  it("groups monitor parts by job alongside ordinary notifications", () => {
    const monitor: BackgroundMonitorNotification = {
      kind: "monitor",
      notificationId: "watch:first",
      backgroundJobId: "bgjob-monitor-1",
      description: "CI",
      command: "watch",
      outputFile: "/tmp/watch.log",
      lines: ["first line"],
    };
    const ended = {
      ...monitor,
      notificationId: "watch:end",
      lines: ["last line"],
      ended: { reason: "finished", status: "completed" as const },
    };
    const { getAllByTestId, getByText } = render(
      <MessageNotifications
        parts={[
          { type: "data-background-job-notification", data: monitor },
          {
            type: "data-background-job-notification",
            data: notification("other", "completed"),
          },
          { type: "data-background-job-notification", data: ended },
        ]}
      />,
    );
    expect(getByText("3").getAttribute("data-slot")).toBe("badge");
    const rows = getAllByTestId("background-job-panel");
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute("data-background-job-id")).toBe(
      monitor.backgroundJobId,
    );
    expect(rows[0].getAttribute("data-status")).toBe("completed");
    expect(rows[0].lastElementChild?.textContent).toBe(
      "first line\nlast line\nfinished",
    );
    expect(rows[1].getAttribute("data-background-job-id")).toBe("other");
  });

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
  status: BackgroundCommandNotification["status"],
): BackgroundCommandNotification {
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

describe("BackgroundJobNotifications", () => {
  it("groups batches by monitor ID at their first occurrence in one notification section", () => {
    const monitor: BackgroundMonitorNotification = {
      kind: "monitor" as const,
      notificationId: "monitor-first",
      backgroundJobId: "bgjob-monitor-1",
      description: "Simulated log entries",
      command: "watch logs",
      outputFile: "/tmp/monitor.log",
      lines: ["first log"],
    };
    const notifications = [
      monitor,
      notification("bgjob-cmd-1", "completed"),
      {
        ...monitor,
        notificationId: "monitor-next",
        lines: ["second log", "third log"],
      },
      {
        ...monitor,
        notificationId: "monitor-ended",
        lines: [],
        ended: { reason: "kill requested", status: "stopped" as const },
      },
    ];
    const snapshot = structuredClone(notifications);
    const { container, getAllByTestId, getByText } = render(
      <BackgroundJobNotifications notifications={notifications} />,
    );
    expect(container.querySelectorAll("section")).toHaveLength(1);
    expect(getByText("4").getAttribute("data-slot")).toBe("badge");
    const rows = getAllByTestId("background-job-panel");
    expect(rows.map((row) => row.firstElementChild?.textContent)).toEqual([
      "Simulated log entries",
      "run bgjob-cmd-1",
    ]);
    expect(rows[0].getAttribute("data-output-file")).toBe("/tmp/monitor.log");
    expect(rows[0].getAttribute("data-status")).toBe("stopped");
    expect(rows[0].lastElementChild?.textContent).toBe(
      "first log\nsecond log\nthird log\nkill requested",
    );
    expect(notifications).toEqual(snapshot);
  });

  it.each([
    ["Watch logs", "tail -f app.log", "Watch logs"],
    ["", "tail -f app.log", "tail -f app.log"],
    ["  ", "tail -f app.log", "tail -f app.log"],
    ["", "", "bgjob-monitor-1"],
    ["  ", "  ", "bgjob-monitor-1"],
  ])(
    "falls back from description %j and command %j to %j",
    (description, command, title) => {
      const { getByTestId } = render(
        <BackgroundJobNotifications
          notifications={[
            {
              kind: "monitor" as const,
              notificationId: "event-1",
              backgroundJobId: "bgjob-monitor-1",
              outputFile: "/tmp/monitor.log",
              description,
              command,
              lines: ["first log"],
            },
          ]}
        />,
      );
      expect(
        getByTestId("background-job-panel").firstElementChild?.textContent,
      ).toBe(title);
    },
  );

  it("keeps monitors with the same description in separate groups", () => {
    const { getAllByTestId } = render(
      <BackgroundJobNotifications
        notifications={[1, 2].map((id) => ({
          kind: "monitor" as const,
          notificationId: `event-${id}`,
          backgroundJobId: `bgjob-monitor-${id}`,
          outputFile: `/tmp/monitor-${id}.log`,
          description: "Watch logs",
          command: `watch ${id}`,
          lines: [`log ${id}`],
        }))}
      />,
    );
    const rows = getAllByTestId("background-job-panel");
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.lastElementChild?.textContent)).toEqual([
      "log 1",
      "log 2",
    ]);
  });
});
