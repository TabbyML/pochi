import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAbortBeforeNavigation } from "../use-abort-before-navigation";

const router = vi.hoisted(() => ({ subscribe: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => router }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("navigation abort", () => {
  it.each(["parent", "child"])(
    "aborts the foreground chat on navigation (%s)",
    (taskId) => {
      const unsubscribe = vi.fn();
      router.subscribe.mockReturnValue(unsubscribe);
      const controller = new AbortController();
      const { unmount } = renderHook(() =>
        useAbortBeforeNavigation(controller, taskId),
      );
      act(() =>
        router.subscribe.mock.calls[0][1]({
          toLocation: { pathname: "/settings" },
        }),
      );
      expect(controller.signal.aborted).toBe(true);
      unmount();
      expect(unsubscribe).toHaveBeenCalledOnce();
    },
  );
});
