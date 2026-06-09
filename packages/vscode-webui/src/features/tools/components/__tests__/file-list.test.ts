import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { FileList, getVirtualFileListRange } from "../file-list";

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/vscode", () => ({
  vscodeHost: {
    openFile: vi.fn(),
  },
}));

describe("getVirtualFileListRange", () => {
  it("renders a small list without padding", () => {
    expect(
      getVirtualFileListRange({
        itemCount: 3,
        scrollTop: 0,
        viewportHeight: 100,
        rowHeight: 24,
        overscan: 4,
      }),
    ).toEqual({
      startIndex: 0,
      endIndex: 3,
      offsetTop: 0,
      totalHeight: 72,
    });
  });

  it("returns a scrolled virtual window without dropping later matches", () => {
    const result = getVirtualFileListRange({
      itemCount: 500,
      scrollTop: 4800,
      viewportHeight: 100,
      rowHeight: 24,
      overscan: 4,
    });

    expect(result.startIndex).toBe(196);
    expect(result.endIndex).toBe(209);
    expect(result.offsetTop).toBe(4704);
    expect(result.totalHeight).toBe(12000);
  });
});

describe("FileList", () => {
  const makeMatches = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      file: `packages/vscode-webui/src/example-${index}.tsx`,
      line: index + 1,
      context: `file list row ${index}`,
    }));
  const visibleText = (container: HTMLElement) =>
    container.textContent?.replace(/\u200B/g, "") ?? "";

  it("keeps the pre-virtualization scroll area styling", () => {
    const { container } = render(
      createElement(FileList, {
        matches: [
          {
            file: "packages/vscode-webui/src/features/tools/components/file-list.tsx",
            line: 12,
            context: "file list style contract",
          },
        ],
      }),
    );

    const scrollArea = container.querySelector('[data-slot="scroll-area"]');
    expect(scrollArea).not.toBeNull();
    expect(scrollArea?.className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        "flex",
        "max-h-[100px]",
        "flex-col",
        "gap-1",
        "rounded",
        "border",
        "p-1",
      ]),
    );
  });

  it("keeps rows at their pre-virtualization natural height", () => {
    const { container } = render(
      createElement(FileList, {
        matches: [
          {
            file: "packages/vscode-webui/src/features/tools/components/file-list.tsx",
            line: 12,
            context: "file list row style contract",
          },
        ],
      }),
    );

    const row = container.querySelector(
      '[title="file list row style contract"]',
    );
    expect(row).not.toBeNull();
    const rowClasses = row?.className.split(/\s+/);
    expect(rowClasses).toEqual(
      expect.arrayContaining([
        "cursor-pointer",
        "truncate",
        "rounded",
        "py-0.5",
        "hover:bg-accent/50",
      ]),
    );
    expect(rowClasses).not.toContain("h-6");
  });

  it("shows shortened display paths for built-in files", () => {
    const { container } = render(
      createElement(FileList, {
        matches: [
          {
            file: "/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/skills/widget-guidelines/references/chart.md",
            context: "built-in skill reference",
          },
          {
            file: "/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/agents/guide/references/config-schema.md",
            context: "built-in agent reference",
          },
        ],
      }),
    );

    const [skillRow, agentRow] = Array.from(
      container.querySelectorAll('[title^="built-in"]'),
    );
    expect(visibleText(skillRow as HTMLElement)).toBe(
      "chart.mdreferences/chart.md",
    );
    expect(visibleText(agentRow as HTMLElement)).toBe(
      "config-schema.mdreferences/config-schema.md",
    );
  });

  it("omits display paths that match the visible basename", () => {
    const { container } = render(
      createElement(FileList, {
        matches: [
          {
            file: "/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/skills/widget-guidelines/SKILL.md",
            context: "built-in skill file",
          },
          {
            file: "/Users/meng/.vscode/extensions/tabbyml.pochi-0.51.0/assets/skills/widget-guidelines/references",
            context: "built-in skill directory",
          },
        ],
      }),
    );

    const [skillFileRow, referencesRow] = Array.from(
      container.querySelectorAll('[title^="built-in"]'),
    );
    expect(visibleText(skillFileRow as HTMLElement)).toBe("SKILL.md");
    expect(visibleText(referencesRow as HTMLElement)).toBe("references");
  });

  it("renders lists at the virtualization threshold without a virtual height spacer", () => {
    const { container } = render(
      createElement(FileList, {
        matches: makeMatches(50),
      }),
    );

    expect(container.querySelector('div.relative[style^="height:"]')).toBeNull();
  });

  it("virtualizes lists above the virtualization threshold", () => {
    const { container } = render(
      createElement(FileList, {
        matches: makeMatches(51),
      }),
    );

    expect(
      container.querySelector('div.relative[style^="height:"]'),
    ).not.toBeNull();
  });
});
