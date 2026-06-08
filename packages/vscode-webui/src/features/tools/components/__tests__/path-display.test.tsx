import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { globFilesTool as GlobFilesTool } from "../glob-files";
import { searchFilesTool as SearchFilesTool } from "../search-files";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../status-icon", () => ({
  StatusIcon: () => <span data-testid="status-icon" />,
}));

vi.mock("../tool-container", () => ({
  ExpandableToolContainer: ({ title }: { title: React.ReactNode }) => (
    <div>{title}</div>
  ),
}));

vi.mock("../file-list", () => ({
  FileList: () => <div data-testid="file-list" />,
}));

const memoryDir = "/Users/jueliang/.pochi/projects/pochi-c212a47e71/memory";

describe("tool path display", () => {
  it("shortens project memory paths in searchFiles titles", () => {
    const { container } = render(
      <SearchFilesTool
        tool={{
          type: "tool-searchFiles",
          toolCallId: "call-1",
          state: "input-available",
          input: {
            path: memoryDir,
            regex: "preference",
          },
        }}
        isExecuting={false}
        isLoading={false}
        messages={[]}
      />,
    );

    expect(container.textContent).toContain("projectMemory");
    expect(container.textContent).not.toContain("/.pochi/projects/");
  });

  it("shortens project memory paths in globFiles titles", () => {
    const { container } = render(
      <GlobFilesTool
        tool={{
          type: "tool-globFiles",
          toolCallId: "call-1",
          state: "input-available",
          input: {
            path: memoryDir,
            globPattern: "*.md",
          },
        }}
        isExecuting={false}
        isLoading={false}
        messages={[]}
      />,
    );

    expect(container.textContent).toContain("projectMemory");
    expect(container.textContent).not.toContain("/.pochi/projects/");
  });
});
