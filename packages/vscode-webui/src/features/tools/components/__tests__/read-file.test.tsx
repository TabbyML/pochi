import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileTool as ReadFileTool } from "../read-file";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "toolInvocation.reading": "Reading ",
        "toolInvocation.readBackground": "Reading background job output",
        "toolInvocation.readTerminal": "Reading terminal output",
      })[key] ?? key,
  }),
}));

vi.mock("../status-icon", () => ({
  StatusIcon: () => <span data-testid="status-icon" />,
}));

vi.mock("../tool-container", () => ({
  ExpandableToolContainer: ({
    title,
    detail,
  }: {
    title: React.ReactNode;
    detail?: React.ReactNode;
  }) => (
    <div>
      {title}
      {detail}
    </div>
  ),
}));

vi.mock("../command-execution-panel", () => ({
  BackgroundJobPanel: ({
    backgroundJobId,
    output,
    terminalName,
    lastCommand,
  }: {
    backgroundJobId: string;
    output?: string;
    terminalName?: string;
    lastCommand?: string;
  }) => (
    <div
      data-testid="background-job-panel"
      data-job-id={backgroundJobId}
      data-terminal-name={terminalName}
      data-last-command={lastCommand}
    >
      {output}
    </div>
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

const renderReadFileTool = (
  input: ReadFileInput,
  result?: {
    content: string;
    isTruncated: boolean;
    _meta?: {
      terminalName?: string;
      lastCommand?: string;
    };
  },
) =>
  render(
    <ReadFileTool
      tool={
        result
          ? {
              type: "tool-readFile",
              toolCallId: "call-1",
              state: "output-available",
              input,
              output: result,
            }
          : {
              type: "tool-readFile",
              toolCallId: "call-1",
              state: "input-available",
              input,
            }
      }
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
      path: "logs/application.log",
      startLine: 20,
      endLine: 30,
      offset: 2,
      limit: 3,
    });

    expect(getByTestId("file-badge").getAttribute("data-start-line")).toBe("2");
    expect(getByTestId("file-badge").getAttribute("data-end-line")).toBe("4");
  });

  it("renders a background job output read like the former dedicated tool", () => {
    const { getByTestId, queryByTestId } = renderReadFileTool(
      {
        path: "pochi://~/background-jobs/bgjob-cmd-test.log",
        offset: 1,
        limit: 50,
      },
      { content: "job output", isTruncated: false },
    );

    expect(queryByTestId("file-badge")).toBeNull();
    expect(
      getByTestId("background-job-panel").getAttribute("data-job-id"),
    ).toBe("bgjob-cmd-test");
    expect(getByTestId("background-job-panel").textContent).toBe("job output");
  });

  it("recognizes user terminal transcript paths", () => {
    const { container, getByTestId } = renderReadFileTool(
      {
        path: "/Users/alice/.pochi/terminals/term-test.log",
      },
      {
        content: "terminal output",
        isTruncated: false,
        _meta: {
          terminalName: "zsh",
          lastCommand: "bun test",
        },
      },
    );

    expect(container.textContent).toContain("Reading terminal output");
    expect(container.textContent).not.toContain(
      "Reading terminal output zsh · bun test",
    );
    expect(
      getByTestId("background-job-panel").getAttribute("data-job-id"),
    ).toBe("term-test");
    expect(
      getByTestId("background-job-panel").getAttribute("data-terminal-name"),
    ).toBe("zsh");
    expect(
      getByTestId("background-job-panel").getAttribute("data-last-command"),
    ).toBe("bun test");
  });

  it("keeps arbitrary log files on the normal readFile display", () => {
    const path = "logs/bgjob-cmd-test.log";
    const { container, queryByTestId } = renderReadFileTool({ path });

    expect(container.textContent).toBe(`Reading ${path}`);
    expect(queryByTestId("background-job-panel")).toBeNull();
  });
});
