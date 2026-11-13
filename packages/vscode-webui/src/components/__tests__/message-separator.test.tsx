// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { MessageSeparator } from "../message-separator";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { duration?: string }) =>
      options?.duration ? `${key}:${options.duration}` : key,
  }),
}));

vi.mock("@/lib/vscode", () => ({
  vscodeHost: { openFile: vi.fn() },
}));

function renderWithQueryClient(node: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      {node}
    </QueryClientProvider>,
  );
}

describe("MessageSeparator", () => {
  it("forks when the Fork action is clicked", async () => {
    const onFork = vi.fn(async () => {});
    renderWithQueryClient(
      <MessageSeparator isLoading={false} onFork={onFork} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "messageSeparator.fork" }),
    );

    await waitFor(() => expect(onFork).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByText("messageSeparator.success")).toBeTruthy(),
    );
  });

  it("offers no restore or compare actions", () => {
    renderWithQueryClient(
      <MessageSeparator
        isLoading={false}
        onFork={vi.fn()}
        compactPart={{ type: "text", text: "<compact>Summary</compact>" }}
        compactMessageId="message-1"
      />,
    );

    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["messageSeparator.summary", "messageSeparator.fork"]);
  });

  it("shows the execution duration as its label", () => {
    renderWithQueryClient(
      <MessageSeparator
        isLoading={false}
        onFork={vi.fn()}
        executionDuration={1500}
      />,
    );

    expect(screen.getByText(/^messageList\.completedIn:/)).toBeTruthy();
  });

  it("shows only the line while loading", () => {
    renderWithQueryClient(<MessageSeparator isLoading onFork={vi.fn()} />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
