import type {
  BackgroundJobNotification,
  MonitorEventEnvelope,
} from "@getpochi/common";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BackgroundJobNotifications } from "../background-job-notifications";

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
  }: {
    backgroundJobId: string;
    command?: string;
    summary?: string;
    status?: string;
    outputFile?: string;
    appearance?: string;
    notificationTitle?: string;
  }) => (
    <div
      data-testid="background-job-panel"
      data-background-job-id={backgroundJobId}
      data-status={status}
      data-output-file={outputFile}
      data-appearance={appearance}
    >
      <span>{notificationTitle ?? command}</span>
      <span>{summary}</span>
    </div>
  ),
}));

describe("BackgroundJobNotifications", () => {
  it("keeps command and monitor batches as ordered flat items in one notification section", () => {
    const monitor: MonitorEventEnvelope = {
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
      "first log",
      "run bgjob-cmd-1",
      "second log\nthird log",
      "kill requested",
    ]);
    expect(rows[0].getAttribute("data-output-file")).toBe("/tmp/monitor.log");
    expect(rows[3].getAttribute("data-status")).toBe("stopped");
    expect(container.textContent).not.toContain("eventCount");
    expect(notifications).toEqual(snapshot);
  });

  it("groups notifications under one data-style section", () => {
    const { container, getAllByTestId, getByText } = render(
      <BackgroundJobNotifications
        notifications={[
          notification("bgjob-cmd-1", "completed"),
          notification("bgjob-cmd-2", "failed"),
        ]}
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
