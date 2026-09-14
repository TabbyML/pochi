import { TooltipProvider } from "@/components/ui/tooltip";
import type { SubAgentResultNotification } from "@getpochi/common";
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubagentResultsPart } from "../subagent-results";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/use-navigate", () => ({ useNavigate: () => navigate }));
vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({ storeId: "store-1" }),
}));
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
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const result: SubAgentResultNotification = {
  kind: "subagent",
  notificationId: "bgjob-task-child:terminal:1",
  backgroundJobId: "bgjob-task-child",
  taskId: "child",
  title: "Inspect test setup",
  status: "completed",
  result: "## Summary\n\n- Run **tests** with `bun test`\n- Check types",
};
const renderResult = (value = result) =>
  render(
    <TooltipProvider>
      <SubagentResultsPart results={[value]} />
    </TooltipProvider>,
  );

describe("subagent result notification", () => {
  it("shows the Markdown result expanded by default", () => {
    const { container } = renderResult();
    const toggle = container.querySelector("[aria-expanded]");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("heading", { name: "Summary", level: 2 }),
    ).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      container.querySelector('[data-streamdown="strong"]')?.textContent,
    ).toBe("tests");
    expect(container.querySelector("code")?.textContent).toBe("bun test");
  });

  it("toggles the preview from the row without navigating", () => {
    renderResult();
    const toggle = screen.getByRole("button", {
      name: "backgroundTasks.toggleResult",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("heading", { name: "Summary" })).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("heading", { name: "Summary" })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("heading", { name: "Summary" })).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("opens the task from its title without toggling the preview in either state", () => {
    const { container } = renderResult();
    fireEvent.click(screen.getByRole("button", { name: "Inspect test setup" }));
    expect(navigate).toHaveBeenCalledWith({
      to: "/task",
      search: { uid: "child", storeId: "store-1" },
    });
    expect(
      container.querySelector("[aria-expanded]")?.getAttribute("aria-expanded"),
    ).toBe("true");
    fireEvent.click(
      screen.getByRole("button", { name: "backgroundTasks.toggleResult" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Inspect test setup" }));
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(
      container.querySelector("[aria-expanded]")?.getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it.each([
    ["completed", false, "completed"],
    ["failed", false, "failed"],
    ["stopped", true, "stopped"],
  ] as const)(
    "uses an accessible icon for %s (stopped: %s)",
    (status, _stopped, label) => {
      renderResult({ ...result, status });
      if (status === "completed") {
        expect(screen.queryByRole("img")).toBeNull();
      } else {
        expect(
          screen.getByRole("img", { name: `backgroundTasks.${label}` }),
        ).toBeTruthy();
      }
      expect(screen.queryByText(`backgroundTasks.${label}`)).toBeNull();
    },
  );
});
