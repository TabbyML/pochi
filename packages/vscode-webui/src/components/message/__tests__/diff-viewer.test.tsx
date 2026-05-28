import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiffViewer } from "../diff-viewer";

const diffMocks = vi.hoisted(() => ({
  parsePatchFiles: vi.fn(),
  resolveThemes: vi.fn(),
}));

const reactDiffMocks = vi.hoisted(() => ({
  fileDiff: vi.fn(),
  patchDiff: vi.fn(),
}));

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
  FileDiff: (props: { fileDiff: { name: string } }) => {
    reactDiffMocks.fileDiff(props);
    return <div data-testid="file-diff">{props.fileDiff.name}</div>;
  },
  PatchDiff: (props: { patch: string }) => {
    reactDiffMocks.patchDiff(props);
    return <div data-testid="patch-diff">{props.patch}</div>;
  },
  Virtualizer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="virtualizer">{children}</div>
  ),
}));

describe("DiffViewer", () => {
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
});
