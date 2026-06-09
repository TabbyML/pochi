import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { globFilesTool as GlobFilesTool } from "../glob-files";
import { searchFilesTool as SearchFilesTool } from "../search-files";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "dark" }),
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
  ExpandableToolContainer: ({ title }: { title: React.ReactNode }) => (
    <div>{title}</div>
  ),
}));

vi.mock("../file-list", () => ({
  FileList: () => <div data-testid="file-list" />,
}));

const memoryDir = "/Users/jueliang/.pochi/projects/pochi-c212a47e71/memory";
const visibleText = (container: HTMLElement) =>
  container.textContent?.replace(/\u200B/g, "") ?? "";

describe("tool path display", () => {
  const originalPochiHomeDir = globalThis.POCHI_HOME_DIR;

  beforeEach(() => {
    globalThis.POCHI_HOME_DIR = "/Users/jueliang";
  });

  afterEach(() => {
    globalThis.POCHI_HOME_DIR = originalPochiHomeDir;
  });

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

    expect(visibleText(container)).toContain("pochi://$/memory");
    expect(visibleText(container)).not.toContain("/.pochi/projects/");
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

    expect(visibleText(container)).toContain("pochi://$/memory");
    expect(visibleText(container)).not.toContain("/.pochi/projects/");
  });
});
