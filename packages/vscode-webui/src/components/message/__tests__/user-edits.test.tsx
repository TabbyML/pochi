// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UserEditsPart } from "../user-edits";

const vscodeHostMock = vi.hoisted(() => ({ openFile: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

vi.mock("@/lib/vscode", () => ({
  vscodeHost: vscodeHostMock,
}));

vi.mock("@/components/message/diff-viewer", () => ({
  DiffViewer: () => null,
}));

const userEdits = [
  {
    filepath: "src/a.ts",
    diff: "@@ -1 +1,2 @@\n one\n+two\n",
  },
];

function expand() {
  fireEvent.click(screen.getByText("userEdits.title"));
}

describe("UserEditsPart", () => {
  it("lists the files from an older task's user edits", () => {
    render(<UserEditsPart userEdits={userEdits} />);
    expand();

    expect(screen.getByText("userEdits.filesEdited:1")).toBeTruthy();
    expect(screen.getByText("src/a.ts")).toBeTruthy();
  });

  it("offers only Open File, since there is no checkpoint to diff against", () => {
    render(<UserEditsPart userEdits={userEdits} />);
    expand();

    fireEvent.click(screen.getByRole("button", { name: "userEdits.openFile" }));

    expect(vscodeHostMock.openFile).toHaveBeenCalledWith("src/a.ts");
    expect(
      screen.queryByRole("button", { name: "userEdits.showDiff" }),
    ).toBeNull();
  });

  it("hides the Open File action on shared pages", () => {
    render(<UserEditsPart userEdits={userEdits} hideActions />);
    expand();

    expect(screen.getByText("src/a.ts")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "userEdits.openFile" }),
    ).toBeNull();
  });
});
