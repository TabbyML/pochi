// @vitest-environment jsdom
import { ReadyForRetryError } from "@/features/retry";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RetryApprovalButton } from "../retry-approval-button";

vi.mock("@/features/chat", () => ({
  useAutoApproveGuard: () => ({ current: "stop" }),
  useHandleChatEvents: () => undefined,
}));

vi.mock("@/lib/hooks/use-debounce-state", () => ({
  useDebounceState: () => [true, vi.fn()],
}));

vi.mock("@/lib/hooks/use-reviews", () => ({
  useReviews: () => [],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => (key === "toolInvocation.retry" ? "Retry" : key),
  }),
}));

describe("RetryApprovalButton", () => {
  it("retries a content-filtered response instead of sending a queued message", () => {
    const retry = vi.fn();
    const onContinueWithQueuedMessage = vi.fn();
    const error = new ReadyForRetryError("content-filter");

    render(
      <RetryApprovalButton
        pendingApproval={{
          name: "retry",
          error,
          attempts: 0,
          delay: undefined,
          countdown: undefined,
          stopCountdown: vi.fn(),
        }}
        retry={retry}
        hasQueuedMessages
        onContinueWithQueuedMessage={onContinueWithQueuedMessage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(retry).toHaveBeenCalledWith(error);
    expect(onContinueWithQueuedMessage).not.toHaveBeenCalled();
  });
});
