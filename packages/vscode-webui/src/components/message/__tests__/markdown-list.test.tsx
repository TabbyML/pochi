// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageMarkdown } from "../markdown";

vi.mock("@/features/chat", () => ({
  useReplaceJobIdsInContent: () => (content: string) => content,
}));

vi.mock("@/features/tools", () => ({
  FileBadge: ({ path }: { path: string }) => <span>{path}</span>,
  IssueBadge: ({ id }: { id: string }) => <span>{id}</span>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => false,
  vscodeHost: {},
}));

describe("MessageMarkdown", () => {
  it("preserves the start of a nested ordered list", () => {
    const { container } = render(
      <MessageMarkdown>{"1. 5. the fifth item"}</MessageMarkdown>,
    );

    expect(container.querySelectorAll("ol")[1].start).toBe(5);
  });

  it("does not leak the markdown node onto list elements", () => {
    const { container } = render(
      <MessageMarkdown>{"- 1. the first item"}</MessageMarkdown>,
    );

    for (const selector of ["ul", "ol", "li"]) {
      for (const element of container.querySelectorAll(selector)) {
        expect(element.getAttributeNames()).not.toContain("node");
      }
    }
  });

  // Guards against memoizing the list components again: a memo comparator that
  // ignores `children` (they are rebuilt on every render, so comparing them is
  // pointless) freezes the whole `ul > li > ol` subtree on rerender.
  it("updates a nested ordered list on rerender", () => {
    const { container, rerender } = render(
      <MessageMarkdown>{"- 1. x"}</MessageMarkdown>,
    );
    expect(container.querySelector("ol")?.start).toBe(1);

    rerender(<MessageMarkdown>{"- 9. x"}</MessageMarkdown>);
    expect(container.querySelector("ol")?.start).toBe(9);
  });
});
