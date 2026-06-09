// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FixWidgetButton } from "../fix-widget-button";

const sendMessageMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/chat", () => ({
  useSendMessage: () => sendMessageMock,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === "toolInvocation.fixWidget" ? "Please fix" : key,
  }),
}));

describe("FixWidgetButton", () => {
  it("sends the fix prompt once", () => {
    sendMessageMock.mockClear();

    render(<FixWidgetButton />);

    const button = screen.getByRole("button", { name: "Please fix" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith({
      prompt: "Please fix the latest render widget so it renders correctly.",
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
