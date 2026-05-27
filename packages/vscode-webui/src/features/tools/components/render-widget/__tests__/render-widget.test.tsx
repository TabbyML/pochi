// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RenderWidgetTool } from "../index";

const sentMessages: Record<string, unknown>[] = [];

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
    send: vi.fn(async (message: Record<string, unknown>) => {
      sentMessages.push(message);
      return { ok: true };
    }),
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

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: "dark", setTheme: () => {} }),
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
    sentMessages.length = 0;
    document.documentElement.className = "";
    document.documentElement.style.cssText = "";
    document.body.className = "";
    document.body.style.cssText = "";
  });

  afterEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.cssText = "";
    document.body.className = "";
    document.body.style.cssText = "";
  });

  it("renders the widget iframe without VS Code tool header chrome", () => {
    render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-no-header",
            state: "input-available",
            input: {
              title: "Clean widget",
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

    expect(screen.queryByTestId("status-icon")).toBeNull();
    expect(screen.queryByText("Rendering widget")).toBeNull();
    expect(screen.queryByText("Clean widget")).toBeNull();
    expect(screen.getByTitle("Clean widget")).toBeTruthy();
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

  it("starts at zero height and waits for the sandboxed renderer to report widget height", () => {
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
    expect(iframe.style.height).toBe("0px");

    act(() => {
      iframe.dispatchEvent(new Event("load"));
    });
    act(() => {
      receiveHandler?.({ type: "height", height: 320 });
    });

    expect(iframe.style.height).toBe("320px");
  });

  it("pushes theme updates when VS Code mutates body theme attributes", async () => {
    render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-theme",
            state: "input-available",
            input: {
              title: "Theme widget",
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

    const iframe = screen.getByTitle("Theme widget");
    act(() => {
      iframe.dispatchEvent(new Event("load"));
    });
    act(() => {
      receiveHandler?.({ type: "ready" });
    });

    await waitFor(() => {
      expect(sentMessages.some((message) => message.type === "theme")).toBe(
        true,
      );
    });
    const initialMessageCount = sentMessages.length;

    await act(async () => {
      document.body.classList.add("vscode-light");
      document.body.style.setProperty("--vscode-editor-foreground", "#123456");
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        sentMessages.slice(initialMessageCount).some((message) => {
          return (
            message.type === "theme" &&
            message.themeClass === "light" &&
            typeof message.variablesCss === "string" &&
            message.variablesCss.includes(
              "--vscode-editor-foreground: #123456;",
            )
          );
        }),
      ).toBe(true);
    });
  });
});
