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
      <MessageMarkdown>{"1. 5. 这是第五条"}</MessageMarkdown>,
    );

    expect(container.querySelectorAll("ol")[1].start).toBe(5);
  });
});
