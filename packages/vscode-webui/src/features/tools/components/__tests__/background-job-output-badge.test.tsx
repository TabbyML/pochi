import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundJobOutputBadge } from "../background-job-output-badge";

const jobInfo = vi.hoisted(
  () => ({ value: undefined }) as { value: unknown | undefined },
);

vi.mock("@/features/chat", () => ({
  useBackgroundJobInfo: () => jobInfo.value,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options?.displayId ? `${key}:${options.displayId}` : key,
  }),
}));

const openFile = vi.hoisted(() => vi.fn());
vi.mock("@/lib/vscode", () => ({
  vscodeHost: { openFile, showCheckpointDiff: vi.fn() },
}));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

const visibleText = (container: HTMLElement) =>
  container.textContent?.replace(/\u200B/g, "") ?? "";

const jobPath =
  "/Users/jueliang/.pochi/tasks/task-1/background-jobs/bgjob-cmd-abc.log";

describe("BackgroundJobOutputBadge", () => {
  const originalPochiHomeDir = globalThis.POCHI_HOME_DIR;

  beforeEach(() => {
    globalThis.POCHI_HOME_DIR = "/Users/jueliang";
    jobInfo.value = { command: "bun run dev", displayId: "%1" };
    openFile.mockReset();
  });

  afterEach(() => {
    globalThis.POCHI_HOME_DIR = originalPochiHomeDir;
  });

  it("labels a tracked job transcript with its display id", () => {
    const { container } = render(
      <BackgroundJobOutputBadge
        path={jobPath}
        outputFile={{ backgroundJobId: "bgjob-cmd-abc", kind: "job" }}
      />,
    );

    expect(visibleText(container)).toBe("fileBadge.backgroundJobOutput:%1");
    expect(container.querySelector("[title]")?.getAttribute("title")).toBe(
      "pochi://~/background-jobs/bgjob-cmd-abc.log",
    );
  });

  it("opens the real transcript file", () => {
    const { container } = render(
      <BackgroundJobOutputBadge
        path={jobPath}
        outputFile={{ backgroundJobId: "bgjob-cmd-abc", kind: "job" }}
      />,
    );

    (container.firstChild as HTMLElement).click();

    expect(openFile).toHaveBeenCalledWith(jobPath, expect.anything());
  });

  it("labels a terminal transcript", () => {
    const { container } = render(
      <BackgroundJobOutputBadge
        path="/Users/jueliang/.pochi/terminals/term-1.log"
        outputFile={{ backgroundJobId: "term-1", kind: "terminal" }}
      />,
    );

    expect(visibleText(container)).toBe("fileBadge.terminalOutput");
  });

  it("falls back to the path when the job is not tracked", () => {
    jobInfo.value = { command: undefined, displayId: "job id: bgjob-cmd-abc" };
    const { container } = render(
      <BackgroundJobOutputBadge
        path={jobPath}
        outputFile={{ backgroundJobId: "bgjob-cmd-abc", kind: "job" }}
      />,
    );

    expect(visibleText(container)).toBe(
      "pochi://~/background-jobs/bgjob-cmd-abc.log",
    );
  });
});
