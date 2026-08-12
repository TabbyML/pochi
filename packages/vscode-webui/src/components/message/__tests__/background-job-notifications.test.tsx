import type { BackgroundJobNotification } from "@getpochi/common";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BackgroundJobNotifications } from "../background-job-notifications";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      if (key === "backgroundJobNotifications.title") {
        return "Background job notifications";
      }
      if (key === "backgroundJobNotifications.notificationCount") {
        return `${options?.count} notifications`;
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
    status,
    outputFile,
    appearance,
  }: {
    backgroundJobId: string;
    command?: string;
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
      {command}
    </div>
  ),
}));

describe("BackgroundJobNotifications", () => {
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
    expect(getByText("Background job notifications")).toBeDefined();
    expect(getByText("2 notifications")).toBeDefined();
    expect(getAllByTestId("background-job-panel")).toHaveLength(2);
    expect(
      getAllByTestId("background-job-panel")[0]?.getAttribute(
        "data-appearance",
      ),
    ).toBe("notification");
    expect(getByText("run bgjob-cmd-1")).toBeDefined();
    expect(getByText("run bgjob-cmd-2")).toBeDefined();
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
