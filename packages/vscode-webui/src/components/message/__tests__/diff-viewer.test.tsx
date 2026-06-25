import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiffViewer } from "../diff-viewer";

const diffMocks = vi.hoisted(() => ({
  parsePatchFiles: vi.fn(),
  resolveThemes: vi.fn(),
}));

const reactDiffMocks = vi.hoisted(() => ({
  fileDiff: vi.fn(),
  patchDiff: vi.fn(),
  virtualizer: vi.fn(),
  codeElements: [] as HTMLElement[],
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
}));

vi.mock("@pierre/diffs/react", () => ({
  FileDiff: (props: {
    fileDiff: { name: string };
    className?: string;
    options: { unsafeCSS?: string };
    style?: React.CSSProperties;
  }) => {
    const ref = React.useRef<HTMLElement>(null);

    React.useLayoutEffect(() => {
      const host = ref.current;
      if (!host) return;

      const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
      shadowRoot.replaceChildren();

      const codeElement = document.createElement("div");
      codeElement.setAttribute("data-code", "");
      Object.defineProperties(codeElement, {
        clientWidth: { configurable: true, value: 400 },
        scrollWidth: { configurable: true, value: 1200 },
      });
      shadowRoot.appendChild(codeElement);
      reactDiffMocks.codeElements.push(codeElement);
    }, []);

    reactDiffMocks.fileDiff(props);
    return React.createElement(
      "diffs-container",
      {
        className: props.className,
        "data-testid": "file-diff",
        ref,
      },
      props.fileDiff.name,
    );
  },
  PatchDiff: (props: { patch: string }) => {
    reactDiffMocks.patchDiff(props);
    return <div data-testid="patch-diff">{props.patch}</div>;
  },
  Virtualizer: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
  }) => {
    reactDiffMocks.virtualizer(props);
    return (
      <div data-testid="virtualizer" className={props.className}>
        {children}
      </div>
    );
  },
}));

describe("DiffViewer", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    diffMocks.parsePatchFiles.mockReset();
    diffMocks.resolveThemes.mockReset();
    reactDiffMocks.fileDiff.mockReset();
    reactDiffMocks.patchDiff.mockReset();
    reactDiffMocks.virtualizer.mockReset();
    reactDiffMocks.codeElements = [];
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

  it("keeps the visible horizontal scrollbar synced with the diff code element", async () => {
    const fileDiff = { name: "src/example.ts" };
    diffMocks.parsePatchFiles.mockReturnValue([{ files: [fileDiff] }]);
    diffMocks.resolveThemes.mockResolvedValue(undefined);

    render(<DiffViewer patch="diff --git a/src/example.ts b/src/example.ts" />);

    await screen.findByTestId("file-diff");

    expect(screen.getByTestId("virtualizer").className.split(/\s+/)).toEqual(
      expect.arrayContaining(["max-h-60", "overflow-y-auto"]),
    );
    expect(reactDiffMocks.virtualizer).toHaveBeenCalledWith(
      expect.objectContaining({
        className: expect.not.stringContaining("overflow-x-scroll"),
        contentClassName: expect.stringContaining("min-w-full"),
      }),
    );
    expect(reactDiffMocks.fileDiff).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          unsafeCSS: expect.stringContaining("[data-code]::-webkit-scrollbar"),
        }),
        className: expect.stringContaining("diff-viewer-file-diff"),
      }),
    );

    expect(
      document.querySelector(
        '[data-slot="scroll-area"][data-diff-viewer-horizontal-scrollbar]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]',
      ),
    ).not.toBeNull();
    const spacer = document.querySelector<HTMLElement>(
      "[data-diff-viewer-horizontal-scrollbar-spacer]",
    );
    expect(spacer).not.toBeNull();

    await waitFor(() => {
      expect(spacer?.style.width).toBe("800px");
    });

    const horizontalViewport = document.querySelector<HTMLElement>(
      '[data-diff-viewer-horizontal-scrollbar] [data-slot="scroll-area-viewport"]',
    );
    expect(horizontalViewport).not.toBeNull();
    if (!horizontalViewport) {
      throw new Error("Expected horizontal scrollbar viewport to exist");
    }

    reactDiffMocks.codeElements[0].scrollLeft = 360;
    fireEvent.scroll(reactDiffMocks.codeElements[0]);
    expect(horizontalViewport.scrollLeft).toBe(360);

    await new Promise((resolve) => setTimeout(resolve, 160));

    horizontalViewport.scrollLeft = 240;
    fireEvent.scroll(horizontalViewport);
    expect(reactDiffMocks.codeElements[0].scrollLeft).toBe(240);
  });
});
