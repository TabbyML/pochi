// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RenderWidgetTool } from "../index";

let receiveHandler:
  | ((event: {
      type: "ready" | "height" | "error";
      height?: number;
      message?: string;
    }) => {
      ok: true;
    })
  | undefined;

vi.mock("bidc", () => ({
  createChannel: vi.fn(() => ({
    receive: vi.fn((handler) => {
      receiveHandler = handler;
    }),
    send: vi.fn(async () => ({ ok: true })),
    cleanup: vi.fn(),
  })),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...classes: Array<string | false | undefined>) =>
    classes.filter(Boolean).join(" "),
}));

vi.mock("../../status-icon", () => ({
  StatusIcon: () => <span data-testid="status-icon" />,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === "toolInvocation.renderingWidget" ? "Rendering widget" : key,
  }),
}));

vi.mock("../renderer-entry.ts?worker&url", () => ({
  default: "http://localhost:4112/widget-renderer.js",
}));

describe("RenderWidgetTool", () => {
  beforeEach(() => {
    receiveHandler = undefined;
  });

  it("shows renderer errors returned from the sandboxed iframe", () => {
    render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-1",
            state: "input-available",
            input: {
              title: "Broken widget",
              kind: "interactive",
              widgetCode: "<script>throw new Error('boom')</script>",
              guidelinesRead: true,
            },
          } as never
        }
        isExecuting={false}
        isLoading={false}
        messages={[]}
      />,
    );

    act(() => {
      screen.getByTitle("Broken widget").dispatchEvent(new Event("load"));
    });
    act(() => {
      receiveHandler?.({ type: "error", message: "boom" });
    });

    expect(screen.getByText("boom")).toBeTruthy();
  });

  it("waits for the sandboxed renderer to report widget height", () => {
    render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-2",
            state: "input-available",
            input: {
              title: "Measured widget",
              kind: "diagram",
              widgetCode: "<svg></svg>",
              guidelinesRead: true,
            },
          } as never
        }
        isExecuting={false}
        isLoading={false}
        messages={[]}
      />,
    );

    const iframe = screen.getByTitle("Measured widget");
    expect(iframe.style.height).toBe("");

    act(() => {
      iframe.dispatchEvent(new Event("load"));
    });
    act(() => {
      receiveHandler?.({ type: "height", height: 320 });
    });

    expect(iframe.style.height).toBe("320px");
  });
});
