import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileTool as ReadFileTool } from "../read-file";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "toolInvocation.reading": "Reading ",
      })[key] ?? key,
  }),
}));

vi.mock("../status-icon", () => ({
  StatusIcon: () => <span data-testid="status-icon" />,
}));

vi.mock("../tool-container", () => ({
  ExpandableToolContainer: ({ title }: { title: React.ReactNode }) => (
    <div>{title}</div>
  ),
}));

vi.mock("../file-badge", () => ({
  FileBadge: ({
    path,
    startLine,
    endLine,
  }: {
    path: string;
    startLine?: number;
    endLine?: number;
  }) => (
    <span
      data-testid="file-badge"
      data-start-line={startLine}
      data-end-line={endLine}
    >
      {path}
    </span>
  ),
}));

interface ReadFileInput {
  path: string;
  startLine?: number;
  endLine?: number;
  offset?: number;
  limit?: number;
}

const renderReadFileTool = (input: ReadFileInput) =>
  render(
    <ReadFileTool
      tool={{
        type: "tool-readFile",
        toolCallId: "call-1",
        state: "input-available",
        input,
      }}
      isExecuting={false}
      isLoading={false}
      messages={[]}
    />,
  );

describe("readFileTool", () => {
  it("shows the standard reading label with the requested file path", () => {
    const path = "packages/vscode-webui/src/main.tsx";
    const { container } = renderReadFileTool({ path });

    expect(container.textContent).toBe(`Reading ${path}`);
  });

  it("shows the offset/limit range when both range styles are present", () => {
    const { getByTestId } = renderReadFileTool({
      path: "pochi://~/background-jobs/bgjob-cmd-test.log",
      startLine: 20,
      endLine: 30,
      offset: 2,
      limit: 3,
    });

    expect(getByTestId("file-badge").getAttribute("data-start-line")).toBe("2");
    expect(getByTestId("file-badge").getAttribute("data-end-line")).toBe("4");
  });
});
