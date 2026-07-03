import { render, screen } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiffViewer } from "../diff-viewer";

const diffMocks = vi.hoisted(() => ({
  parsePatchFiles: vi.fn(),
  resolveThemes: vi.fn(),
  virtualizerInstances: [] as Array<{
    setup: ReturnType<typeof vi.fn>;
    cleanUp: ReturnType<typeof vi.fn>;
  }>,
  Virtualizer: vi.fn(() => {
    const instance = {
      setup: vi.fn(),
      cleanUp: vi.fn(),
    };
    diffMocks.virtualizerInstances.push(instance);
    return instance;
  }),
}));

const reactDiffMocks = vi.hoisted(() => ({
  fileDiff: vi.fn(),
  patchDiff: vi.fn(),
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@pierre/diffs", () => ({
  parsePatchFiles: diffMocks.parsePatchFiles,
  resolveThemes: diffMocks.resolveThemes,
  Virtualizer: diffMocks.Virtualizer,
}));

vi.mock("@pierre/diffs/react", () => ({
  FileDiff: (props: {
    fileDiff: { name: string };
    className?: string;
    options: { unsafeCSS?: string };
    style?: React.CSSProperties;
  }) => {
    reactDiffMocks.fileDiff(props);
    return React.createElement(
      "diffs-container",
      {
        className: props.className,
        "data-testid": "file-diff",
      },
      props.fileDiff.name,
    );
  },
  PatchDiff: (props: { patch: string }) => {
    reactDiffMocks.patchDiff(props);
    return <div data-testid="patch-diff">{props.patch}</div>;
  },
  VirtualizerContext: React.createContext(undefined),
}));

describe("DiffViewer", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    diffMocks.parsePatchFiles.mockReset();
    diffMocks.resolveThemes.mockReset();
    reactDiffMocks.fileDiff.mockReset();
    reactDiffMocks.patchDiff.mockReset();
    diffMocks.Virtualizer.mockClear();
    diffMocks.virtualizerInstances.length = 0;
  });

  it("renders the parsed file diff without reparsing through PatchDiff", async () => {
    const fileDiff = { name: "docs/plan.md" };
    diffMocks.parsePatchFiles.mockReturnValue([{ files: [fileDiff] }]);
    diffMocks.resolveThemes.mockResolvedValue(undefined);

    render(<DiffViewer patch="diff --git a/docs/plan.md b/docs/plan.md" />);

    expect((await screen.findByTestId("file-diff")).textContent).toBe(
      "docs/plan.md",
    );
    expect(diffMocks.parsePatchFiles).toHaveBeenCalledTimes(1);
    expect(reactDiffMocks.fileDiff).toHaveBeenCalledWith(
      expect.objectContaining({ fileDiff }),
    );
    expect(reactDiffMocks.patchDiff).not.toHaveBeenCalled();
  });

  it("renders the diff in an always-visible outer horizontal ScrollArea", async () => {
    const fileDiff = { name: "src/example.ts" };
    diffMocks.parsePatchFiles.mockReturnValue([{ files: [fileDiff] }]);
    diffMocks.resolveThemes.mockResolvedValue(undefined);

    render(<DiffViewer patch="diff --git a/src/example.ts b/src/example.ts" />);

    await screen.findByTestId("file-diff");

    expect(screen.queryByTestId("virtualizer")).toBeNull();
    expect(diffMocks.Virtualizer).toHaveBeenCalledTimes(1);
    expect(diffMocks.virtualizerInstances.at(-1)?.setup).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.any(Element),
    );
    expect(reactDiffMocks.fileDiff).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ unsafeCSS: expect.any(String) }),
        className: expect.stringContaining("diff-viewer-file-diff"),
      }),
    );
    const unsafeCSS =
      reactDiffMocks.fileDiff.mock.calls.at(-1)?.[0].options.unsafeCSS;
    expect(unsafeCSS).toContain('[data-overflow="scroll"]');
    expect(unsafeCSS).toContain("--diffs-code-grid");
    expect(unsafeCSS).toContain('[data-overflow="scroll"] [data-line]');
    expect(unsafeCSS).toContain("[data-code]::-webkit-scrollbar");
    expect(unsafeCSS).toContain("contain: none");
    expect(unsafeCSS).toContain("container-type: normal");
    expect(unsafeCSS).toContain(
      '[data-unified] [data-separator="line-info"] [data-separator-wrapper]',
    );
    expect(unsafeCSS).toContain("width: var(--diffs-column-width, 100%)");
    expect(unsafeCSS).toContain(
      "width: calc(var(--diffs-column-width, 100%) - var(--diffs-gap-inline, var(--diffs-gap-fallback)))",
    );
    expect(unsafeCSS).toContain('[data-overflow="scroll"] [data-gutter]');
    expect(unsafeCSS).toContain("position: static");

    const scrollAreaRoot = document.querySelector(
      '[data-slot="scroll-area"][data-diff-viewer-horizontal-scrollbar]',
    );
    expect(scrollAreaRoot).not.toBeNull();
    expect(scrollAreaRoot?.className).toContain("max-h-60");
    expect(scrollAreaRoot?.className).not.toContain(
      "bg-[var(--vscode-editor-background)]",
    );

    const verticalScrollbar = document.querySelector(
      '[data-slot="scroll-area-scrollbar"][data-orientation="vertical"]',
    );
    expect(verticalScrollbar).not.toBeNull();
    expect(verticalScrollbar?.className).toContain(
      "var(--vscode-scrollbarSlider-background)_88%,var(--vscode-editor-foreground)_12%",
    );
    expect(verticalScrollbar?.className).toContain(
      "var(--vscode-scrollbarSlider-hoverBackground)_90%,var(--vscode-editor-foreground)_10%",
    );
    expect(verticalScrollbar?.className).not.toContain(
      "bg-[var(--vscode-editor-background)]",
    );

    const horizontalScrollbar = document.querySelector(
      '[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]',
    );
    expect(horizontalScrollbar).not.toBeNull();
    expect(horizontalScrollbar?.className).toContain(
      "var(--vscode-scrollbarSlider-background)_88%,var(--vscode-editor-foreground)_12%",
    );
    expect(horizontalScrollbar?.className).toContain(
      "var(--vscode-scrollbarSlider-hoverBackground)_90%,var(--vscode-editor-foreground)_10%",
    );
    expect(horizontalScrollbar?.className).not.toContain(
      "[&_[data-slot=scroll-area-thumb]]:rounded-full",
    );
    expect(horizontalScrollbar?.className).not.toContain(
      "bg-[var(--vscode-editor-background)]",
    );
    const spacer = document.querySelector<HTMLElement>(
      "[data-diff-viewer-horizontal-scrollbar-spacer]",
    );
    expect(spacer).toBeNull();

    const horizontalViewport = document.querySelector<HTMLElement>(
      '[data-diff-viewer-horizontal-scrollbar] [data-slot="scroll-area-viewport"]',
    );
    expect(horizontalViewport).not.toBeNull();
    if (!horizontalViewport) {
      throw new Error("Expected horizontal scrollbar viewport to exist");
    }
    expect(horizontalViewport.className).toContain("max-h-60");
    expect(
      document.querySelector("[data-diff-viewer-scroll-content]")?.className,
    ).toContain("w-max");
    expect(
      document.querySelector("[data-diff-viewer-scroll-content]")?.className,
    ).not.toContain("pr-3");
    expect(
      document.querySelector("[data-diff-viewer-scroll-content]")?.className,
    ).not.toContain("pb-3");
  });
});
