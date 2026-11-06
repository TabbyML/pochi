import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubtaskInfo } from "../hooks/use-subtask-info";
import { SubtaskHeader } from "./subtask";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hooks/use-navigate", () => ({
  useNavigate: () => navigate,
}));

const subtask = { parentUid: "parent" } as SubtaskInfo;

const releaseMouseButton = (button: number) => {
  const event = new MouseEvent("mouseup", {
    button,
    bubbles: true,
    cancelable: true,
  });
  fireEvent(document.body, event);
  return event;
};

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("SubtaskHeader", () => {
  it("returns to the parent task on mouse back instead of a history back", () => {
    render(<SubtaskHeader subtask={subtask} />);

    const event = releaseMouseButton(3);

    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith({
      to: "/task",
      search: { uid: "parent" },
      replace: true,
      viewTransition: true,
    });
  });

  it("ignores other mouse buttons", () => {
    render(<SubtaskHeader subtask={subtask} />);

    for (const button of [0, 1, 2, 4]) {
      expect(releaseMouseButton(button).defaultPrevented).toBe(false);
    }
    expect(navigate).not.toHaveBeenCalled();
  });

  it("stops handling mouse back after unmount", () => {
    const { unmount } = render(<SubtaskHeader subtask={subtask} />);
    unmount();

    expect(releaseMouseButton(3).defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
