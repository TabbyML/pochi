import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listFilesTool as ListFilesTool } from "../list-files";

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      key === "toolInvocation.result" ? `${options?.count ?? 0} results` : key,
  }),
}));

vi.mock("@/lib/vscode", () => ({
  vscodeHost: {
    openFile: vi.fn(),
    showCheckpointDiff: vi.fn(),
  },
}));

vi.mock("../status-icon", () => ({
  StatusIcon: () => <span data-testid="status-icon" />,
}));

vi.mock("../tool-container", () => ({
  ExpandableToolContainer: ({
    title,
    expandableDetail,
  }: {
    title: React.ReactNode;
    expandableDetail?: React.ReactNode;
  }) => (
    <div>
      <div>{title}</div>
      <div>{expandableDetail}</div>
    </div>
  ),
}));

const visibleText = (container: HTMLElement) =>
  container.textContent?.replace(/\u200B/g, "") ?? "";

describe("listFilesTool", () => {
  const originalPochiHomeDir = globalThis.POCHI_HOME_DIR;

  beforeEach(() => {
    globalThis.POCHI_HOME_DIR = "/Users/jueliang";
  });

  afterEach(() => {
    globalThis.POCHI_HOME_DIR = originalPochiHomeDir;
  });

  it("formats persisted task output paths in expanded file lists", () => {
    const { container } = render(
      <ListFilesTool
        tool={
          {
            type: "tool-listFiles",
            toolCallId: "call-1",
            state: "output-available",
            input: {
              path: "/Users/jueliang/.pochi/tasks/ac7cadc8-4685-4508-9c75-2cf273b54deb/tool-results",
            },
            output: {
              files: [
                "../../../../.pochi/tasks/ac7cadc8-4685-4508-9c75-2cf273b54deb/tool-results/executeCommand-HsqmmmQnwJuB1Jtz-output.log",
              ],
              isTruncated: false,
            },
          } as never
        }
        isExecuting={false}
        isLoading={false}
        messages={[]}
      />,
    );

    expect(visibleText(container)).toContain(
      "executeCommand-HsqmmmQnwJuB1Jtz-output.logpochi://~/tool-results/executeCommand-HsqmmmQnwJuB1Jtz-output.log",
    );
  });
});
