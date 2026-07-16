// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActiveSelectionPart,
  TerminalSelectionPart,
} from "../active-selection";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/hover-card", () => ({
  HoverCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  HoverCardTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/components/message", () => ({
  CodeBlock: ({ language, value }: { language: string; value: string }) => (
    <pre data-testid="code-block" data-language={language}>
      {value}
    </pre>
  ),
}));

const isVSCodeEnvironmentMock = vi.hoisted(() => vi.fn(() => true));
const openFileMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: isVSCodeEnvironmentMock,
  vscodeHost: {
    openFile: openFileMock,
  },
}));

const openBackgroundJobTerminalMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/use-visible-terminals", () => ({
  useVisibleTerminals: () => ({
    terminals: [],
    openBackgroundJobTerminal: openBackgroundJobTerminalMock,
  }),
}));

const visibleText = (el: HTMLElement) =>
  el.textContent?.replace(/\u200B/g, "") ?? "";

beforeEach(() => {
  isVSCodeEnvironmentMock.mockReturnValue(true);
  openFileMock.mockReset();
  openBackgroundJobTerminalMock.mockReset();
});

describe("ActiveSelectionPart", () => {
  it("renders nothing when content is empty", () => {
    const { container } = render(
      <ActiveSelectionPart
        activeSelection={{
          filepath: "src/main.tsx",
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
          content: "",
        }}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("opens the file at the selected range on click", () => {
    const { container } = render(
      <ActiveSelectionPart
        activeSelection={{
          filepath: "src/main.tsx",
          range: {
            start: { line: 9, character: 0 },
            end: { line: 24, character: 0 },
          },
          content: "const x = 1;",
        }}
      />,
    );

    expect(visibleText(container)).toContain("main.tsx:10-25");

    const badge = container.querySelector("span.cursor-pointer");
    (badge as HTMLElement).click();

    expect(openFileMock).toHaveBeenCalledWith("src/main.tsx", {
      start: 10,
      end: 25,
      cellId: undefined,
    });
  });
});

describe("TerminalSelectionPart", () => {
  it("renders nothing when content is empty", () => {
    const { container } = render(
      <TerminalSelectionPart
        terminalTextSelection={{
          terminalName: "bash",
          content: "",
        }}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders the terminal name and a shell-language preview", () => {
    const { container } = render(
      <TerminalSelectionPart
        terminalTextSelection={{
          terminalName: "bash",
          backgroundJobId: "term-1",
          content: "echo hello",
        }}
      />,
    );

    expect(visibleText(container)).toContain("bash");
    const codeBlock = screen.getByTestId("code-block");
    expect(codeBlock.getAttribute("data-language")).toBe("shell");
    expect(codeBlock.textContent).toBe("echo hello");
  });

  it("opens the terminal via openBackgroundJobTerminal when clicked", () => {
    const { container } = render(
      <TerminalSelectionPart
        terminalTextSelection={{
          terminalName: "bash",
          backgroundJobId: "term-1",
          content: "echo hello",
        }}
      />,
    );

    const badge = container.querySelector("span.cursor-pointer");
    (badge as HTMLElement).click();

    expect(openBackgroundJobTerminalMock).toHaveBeenCalledWith("term-1");
  });

  it("does not attempt to open a terminal when backgroundJobId is missing", () => {
    const { container } = render(
      <TerminalSelectionPart
        terminalTextSelection={{
          terminalName: "bash",
          content: "echo hello",
        }}
      />,
    );

    const badge = container.querySelector("span.cursor-pointer");
    (badge as HTMLElement).click();

    expect(openBackgroundJobTerminalMock).not.toHaveBeenCalled();
  });
});
