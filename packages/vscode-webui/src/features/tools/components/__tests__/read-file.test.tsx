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
  FileBadge: ({ path }: { path: string }) => (
    <span data-testid="file-badge">{path}</span>
  ),
}));

const renderReadFileTool = (path: string) =>
  render(
    <ReadFileTool
      tool={{
        type: "tool-readFile",
        toolCallId: "call-1",
        state: "input-available",
        input: { path },
      }}
      isExecuting={false}
      isLoading={false}
      messages={[]}
    />,
  );

describe("readFileTool", () => {
  it("shows the standard reading label with the requested file path", () => {
    const path = "packages/vscode-webui/src/main.tsx";
    const { container } = renderReadFileTool(path);

    expect(container.textContent).toBe(`Reading ${path}`);
  });
});
