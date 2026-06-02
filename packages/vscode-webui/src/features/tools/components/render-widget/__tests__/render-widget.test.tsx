import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @vitest-environment jsdom
import { useRenderWidgetStore } from "../../../../chat/hooks/use-render-widget-store";
import { RenderWidgetTool } from "../index";

const sendMessageMock = vi.hoisted(() => vi.fn());
const sentMessages: Record<string, unknown>[] = [];

let receiveHandler:
  | ((event: {
      type: "ready" | "height" | "error" | "state" | "sendMessage";
      height?: number;
      message?: string;
      prompt?: string;
      state?: unknown;
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

let mockedTheme: "dark" | "light" = "dark";

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: mockedTheme, setTheme: () => {} }),
}));

vi.mock("../../../../chat/lib/chat-events", () => ({
  useSendMessage: () => sendMessageMock,
}));

vi.mock("../renderer-entry.ts?worker&url", () => ({
  default: "http://localhost:4112/widget-renderer.js",
}));

function getWidgetIframe(container: HTMLElement): HTMLIFrameElement {
  const iframe = container.querySelector("iframe");
  expect(iframe).toBeTruthy();
  return iframe as HTMLIFrameElement;
}

describe("RenderWidgetTool", () => {
  beforeEach(() => {
    receiveHandler = undefined;
    sendMessageMock.mockClear();
    sentMessages.length = 0;
    mockedTheme = "dark";
    document.documentElement.className = "";
    document.documentElement.style.cssText = "";
    document.body.className = "";
    document.body.style.cssText = "";
    useRenderWidgetStore.getState().clearAllWidgetStates();
  });

  afterEach(() => {
    document.documentElement.className = "";
    document.documentElement.style.cssText = "";
    document.body.className = "";
    document.body.style.cssText = "";
  });

  it("renders the widget iframe without VS Code tool header chrome", () => {
    const { container } = render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-no-header",
            state: "input-available",
            input: {
              title: "Clean widget",
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
    expect(getWidgetIframe(container).getAttribute("title")).toBe(
      "Clean widget",
    );
  });

  it("falls back to the tool call id when the widget title is unavailable", () => {
    const { container } = render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-legacy",
            state: "input-available",
            input: {
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

    expect(getWidgetIframe(container).getAttribute("title")).toBe(
      "widget_widget-legacy",
    );
  });

  it("shows renderer errors returned from the sandboxed iframe", () => {
    const { container } = render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-1",
            state: "input-available",
            input: {
              title: "Broken widget",
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
      getWidgetIframe(container).dispatchEvent(new Event("load"));
    });
    act(() => {
      receiveHandler?.({ type: "error", message: "boom" });
    });

    expect(screen.getByText("boom")).toBeTruthy();
  });

  it("starts at zero height and waits for the sandboxed renderer to report widget height", () => {
    const { container } = render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-2",
            state: "input-available",
            input: {
              title: "Measured widget",
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

    const iframe = getWidgetIframe(container);
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
    const { container } = render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-theme",
            state: "input-available",
            input: {
              title: "Theme widget",
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

    const iframe = getWidgetIframe(container);
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

  it("keeps the iframe mounted across parent theme switches", () => {
    const { container, rerender } = render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-stable-src",
            state: "input-available",
            input: {
              title: "Stable widget",
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

    const iframe = getWidgetIframe(container);
    const originalSrc = iframe.src;
    expect(originalSrc).toBeTruthy();

    mockedTheme = "light";
    rerender(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-stable-src",
            state: "input-available",
            input: {
              title: "Stable widget",
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

    // The iframe src must NOT change when the parent webview theme switches —
    // a new src would remount the iframe and clear the rendered widget body
    // until the next render message arrives. Theme updates are pushed via the
    // theme message channel instead.
    expect(getWidgetIframe(container).getAttribute("src")).toBe(originalSrc);
  });

  it("replays the last render message when the iframe reloads", async () => {
    const { container } = render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-replay",
            state: "input-available",
            input: {
              title: "Replay widget",
              widgetCode: "<svg><rect/></svg>",
              guidelinesRead: true,
            },
          } as never
        }
        isExecuting={false}
        isLoading={false}
        messages={[]}
      />,
    );

    const iframe = getWidgetIframe(container);
    act(() => {
      iframe.dispatchEvent(new Event("load"));
    });
    act(() => {
      receiveHandler?.({ type: "ready" });
    });

    await waitFor(() => {
      expect(
        sentMessages.some(
          (message) =>
            message.type === "finalize" &&
            typeof message.html === "string" &&
            (message.html as string).includes("rect"),
        ),
      ).toBe(true);
    });

    sentMessages.length = 0;

    // Simulate an iframe reload (which the bidc channel cleanup mimics).
    act(() => {
      iframe.dispatchEvent(new Event("load"));
    });
    act(() => {
      receiveHandler?.({ type: "ready" });
    });

    await waitFor(() => {
      expect(
        sentMessages.some(
          (message) =>
            (message.type === "finalize" || message.type === "preview") &&
            typeof message.html === "string" &&
            (message.html as string).includes("rect"),
        ),
      ).toBe(true);
    });
  });

  it("forwards widget sendMessage events through the chat send-message event", () => {
    const { container } = render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-message",
            state: "input-available",
            input: {
              title: "Message widget",
              widgetCode: "<pochi-widget state='{}'></pochi-widget>",
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
      getWidgetIframe(container).dispatchEvent(new Event("load"));
    });
    act(() => {
      receiveHandler?.({
        type: "sendMessage",
        prompt: "show next 15 days weather",
      });
    });

    expect(sendMessageMock).toHaveBeenCalledWith({
      prompt: "show next 15 days weather",
    });
  });

  it("stops accepting widget events after the renderWidget call has output", () => {
    const { container, rerender } = render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-transition-output",
            state: "input-available",
            input: {
              title: "Transition widget",
              widgetCode: "<pochi-widget state='{}'></pochi-widget>",
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
      getWidgetIframe(container).dispatchEvent(new Event("load"));
    });
    act(() => {
      receiveHandler?.({ type: "state", state: { city: "beijing" } });
    });

    expect(
      useRenderWidgetStore
        .getState()
        .getWidgetState("widget-transition-output"),
    ).toEqual({ city: "beijing" });

    act(() => {
      rerender(
        <RenderWidgetTool
          tool={
            {
              type: "tool-renderWidget",
              toolCallId: "widget-transition-output",
              state: "output-available",
              input: {
                title: "Transition widget",
                widgetCode: "<pochi-widget state='{}'></pochi-widget>",
                guidelinesRead: true,
              },
              output: { state: { city: "beijing" } },
            } as never
          }
          isExecuting={false}
          isLoading={false}
          messages={[]}
        />,
      );
    });

    act(() => {
      receiveHandler?.({ type: "state", state: { city: "shanghai" } });
      receiveHandler?.({
        type: "sendMessage",
        prompt: "show next 15 days weather",
      });
    });

    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(
      useRenderWidgetStore
        .getState()
        .getWidgetState("widget-transition-output"),
    ).toBeUndefined();
  });

  it("ignores widget sendMessage events after the renderWidget call has output", () => {
    const { container } = render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-output",
            state: "output-available",
            input: {
              title: "Message widget",
              widgetCode: "<pochi-widget state='{}'></pochi-widget>",
              guidelinesRead: true,
            },
            output: { state: { city: "beijing" } },
          } as never
        }
        isExecuting={false}
        isLoading={false}
        messages={[]}
      />,
    );

    act(() => {
      getWidgetIframe(container).dispatchEvent(new Event("load"));
    });
    act(() => {
      receiveHandler?.({
        type: "sendMessage",
        prompt: "show next 15 days weather",
      });
    });

    expect(sendMessageMock).not.toHaveBeenCalled();
    expect(
      useRenderWidgetStore.getState().getWidgetState("widget-output"),
    ).toBeUndefined();
  });
});
