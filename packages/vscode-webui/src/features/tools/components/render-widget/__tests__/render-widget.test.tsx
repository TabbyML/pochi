// @vitest-environment jsdom
import { useRenderWidgetStore } from "@/features/chat";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RenderWidgetTool } from "../index";

const statusIconMock = vi.hoisted(() =>
  vi.fn((_props: Record<string, unknown>) => (
    <span data-testid="status-icon" />
  )),
);
const lifecycleMocks = vi.hoisted(() => {
  const lifecycle = {
    status: "init",
    addResult: vi.fn(),
  };
  return {
    lifecycle,
    getToolCallLifeCycle: vi.fn(() => lifecycle),
  };
});
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
const sentMessages: Record<string, unknown>[] = [];
let sendHandler:
  | ((message: Record<string, unknown>) => Promise<{ ok: true }>)
  | undefined;

let receiveHandler:
  | ((event: {
      type: "ready" | "height" | "error" | "state";
      height?: number;
      message?: string;
      kind?: "internal" | "runtime";
      state?: unknown;
    }) => {
      ok: true;
    })
  | undefined;

vi.mock("@/lib/vscode", () => ({
  vscodeHost: {},
}));

vi.mock("bidc", () => ({
  createChannel: vi.fn(() => ({
    receive: vi.fn((handler) => {
      receiveHandler = handler;
    }),
    send: vi.fn(async (message: Record<string, unknown>) => {
      if (sendHandler) return sendHandler(message);
      sentMessages.push(message);
      return { ok: true };
    }),
    cleanup: vi.fn(),
  })),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...classes: Array<string | false | undefined>) =>
    classes.filter(Boolean).join(" "),
  tw: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce(
      (acc, str, idx) =>
        acc + str + (values[idx] !== undefined ? String(values[idx]) : ""),
      "",
    ),
}));

vi.mock("../../status-icon", () => ({
  StatusIcon: statusIconMock,
}));

vi.mock("@/features/chat", async () => {
  const { useRenderWidgetStore } = await import(
    "../../../../chat/hooks/use-render-widget-store"
  );
  const {
    getRenderWidgetErrorMessageKey,
    mergeRenderWidgetError,
    normalizeRenderWidgetError,
  } = await import("../../../../chat/lib/render-widget-error");
  return {
    getRenderWidgetErrorMessageKey,
    mergeRenderWidgetError,
    normalizeRenderWidgetError,
    useRenderWidgetStore,
    useToolCallLifeCycle: () => ({
      getToolCallLifeCycle: lifecycleMocks.getToolCallLifeCycle,
    }),
  };
});

let mockedTheme: "dark" | "light" = "dark";

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ theme: mockedTheme, setTheme: () => {} }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "toolInvocation.renderWidget": "Render Widget",
        "toolInvocation.widgetFrozen":
          "This widget is from an earlier message. Only the latest widget remains interactive.",
        "toolInvocation.widgetInternalError": "Widget setup error.",
        "toolInvocation.widgetRuntimeError": "Widget runtime error.",
      };
      return translations[key] ?? key;
    },
  }),
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
    sendHandler = undefined;
    statusIconMock.mockClear();
    lifecycleMocks.lifecycle.status = "init";
    lifecycleMocks.lifecycle.addResult.mockReset();
    lifecycleMocks.lifecycle.addResult.mockImplementation(() => {
      lifecycleMocks.lifecycle.status = "complete";
    });
    lifecycleMocks.getToolCallLifeCycle.mockClear();
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

  it("renders the widget iframe with render widget header chrome", () => {
    const tool = {
      type: "tool-renderWidget",
      toolCallId: "widget-header",
      state: "input-available",
      input: {
        title: "Weather Widget",
        widgetCode: "<svg></svg>",
        guidelinesRead: true,
      },
    } as never;
    const { container } = render(
      <RenderWidgetTool
        tool={tool}
        isExecuting={false}
        isLoading={false}
        messages={createMessagesWithTool(tool)}
      />,
    );

    expect(screen.getByTestId("status-icon")).toBeTruthy();
    expect(statusIconMock.mock.calls[0]?.[0]).toMatchObject({
      isExecuting: false,
      tool: {
        state: "output-available",
        toolCallId: "widget-header",
        output: {},
      },
    });
    expect(screen.getByText("Render Widget")).toBeTruthy();
    expect(screen.getByText("Weather Widget")).toBeTruthy();
    expect(getWidgetIframe(container).getAttribute("title")).toBe(
      "Weather Widget",
    );
  });

  it("does not complete the widget while the widget input is streaming", () => {
    const tool = {
      type: "tool-renderWidget",
      toolCallId: "widget-streaming",
      state: "input-streaming",
      input: {
        title: "Streaming Widget",
        widgetCode: "<svg></svg>",
        guidelinesRead: true,
      },
    } as never;

    render(
      <RenderWidgetTool
        tool={tool}
        isExecuting={true}
        isLoading={true}
        messages={createMessagesWithTool(tool)}
      />,
    );

    expect(statusIconMock.mock.calls[0]?.[0]).toMatchObject({
      isExecuting: true,
      tool: {
        state: "input-streaming",
        toolCallId: "widget-streaming",
      },
    });
    expect(lifecycleMocks.lifecycle.addResult).not.toHaveBeenCalled();
  });

  it("does not auto-complete the final widget input", () => {
    const tool = {
      type: "tool-renderWidget",
      toolCallId: "widget-complete",
      state: "input-available",
      input: {
        title: "Complete Widget",
        widgetCode: "<svg></svg>",
        guidelinesRead: true,
      },
    } as never;
    const { rerender } = render(
      <RenderWidgetTool
        tool={tool}
        isExecuting={false}
        isLoading={false}
        messages={createMessagesWithTool(tool)}
      />,
    );

    expect(lifecycleMocks.lifecycle.addResult).not.toHaveBeenCalled();

    rerender(
      <RenderWidgetTool
        tool={tool}
        isExecuting={false}
        isLoading={false}
        messages={createMessagesWithTool(tool)}
      />,
    );

    expect(lifecycleMocks.lifecycle.addResult).not.toHaveBeenCalled();
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

  it("shows renderer errors in the header without inline error chrome", () => {
    const tool = {
      type: "tool-renderWidget",
      toolCallId: "widget-1",
      state: "input-available",
      input: {
        title: "Broken widget",
        widgetCode: "<script>throw new Error('boom')</script>",
        guidelinesRead: true,
      },
    } as never;
    const { container } = render(
      <RenderWidgetTool
        tool={tool}
        isExecuting={false}
        isLoading={false}
        messages={createMessagesWithTool(tool)}
      />,
    );

    act(() => {
      getWidgetIframe(container).dispatchEvent(new Event("load"));
    });
    act(() => {
      receiveHandler?.({ type: "error", message: "boom" });
    });

    expect(screen.queryByText("Widget failed")).toBeNull();
    expect(screen.queryByText("toolInvocation.widgetFailed")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
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

  it("keeps a newer render message queued when an older render send fails", async () => {
    let rejectPreview: ((error: Error) => void) | undefined;
    let resolvePreviewStarted: (() => void) | undefined;
    const previewStarted = new Promise<void>((resolve) => {
      resolvePreviewStarted = resolve;
    });
    let shouldRejectPreview = true;

    sendHandler = (message) => {
      sentMessages.push(message);
      if (
        shouldRejectPreview &&
        message.type === "preview" &&
        typeof message.html === "string" &&
        message.html.includes("preview")
      ) {
        shouldRejectPreview = false;
        resolvePreviewStarted?.();
        return new Promise<{ ok: true }>((_, reject) => {
          rejectPreview = reject;
        });
      }
      return Promise.resolve({ ok: true });
    };

    const { container, rerender } = render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-render-retry",
            state: "input-streaming",
            input: {
              title: "Retry widget",
              widgetCode: "<div>preview</div>",
              guidelinesRead: true,
            },
          } as never
        }
        isExecuting={true}
        isLoading={true}
        isLastPart={true}
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
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 160));
    });
    await previewStarted;

    rerender(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-render-retry",
            state: "input-available",
            input: {
              title: "Retry widget",
              widgetCode: "<div>final</div>",
              guidelinesRead: true,
            },
          } as never
        }
        isExecuting={false}
        isLoading={false}
        isLastPart={true}
        messages={[]}
      />,
    );

    act(() => {
      rejectPreview?.(new Error("send failed"));
    });

    await waitFor(() => {
      const renderMessages = sentMessages.filter(
        (message) => message.type === "preview" || message.type === "finalize",
      );
      const lastRenderMessage = renderMessages.at(-1);
      expect(lastRenderMessage?.type).toBe("finalize");
      expect(lastRenderMessage?.html).toContain("final");
    });
  });

  it("keeps a newer theme message queued when an older theme send fails", async () => {
    let rejectTheme: ((error: Error) => void) | undefined;
    let resolveThemeStarted: (() => void) | undefined;
    const themeStarted = new Promise<void>((resolve) => {
      resolveThemeStarted = resolve;
    });
    let shouldRejectTheme = true;

    sendHandler = (message) => {
      sentMessages.push(message);
      if (shouldRejectTheme && message.type === "theme") {
        shouldRejectTheme = false;
        resolveThemeStarted?.();
        return new Promise<{ ok: true }>((_, reject) => {
          rejectTheme = reject;
        });
      }
      return Promise.resolve({ ok: true });
    };

    const { container } = render(
      <RenderWidgetTool
        tool={
          {
            type: "tool-renderWidget",
            toolCallId: "widget-theme-retry",
            state: "input-available",
            input: {
              title: "Theme retry widget",
              widgetCode: "<svg></svg>",
              guidelinesRead: true,
            },
          } as never
        }
        isExecuting={false}
        isLoading={false}
        isLastPart={true}
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
    await themeStarted;

    await act(async () => {
      document.body.classList.add("vscode-light");
      document.body.style.setProperty("--vscode-editor-foreground", "#123456");
      await Promise.resolve();
    });
    act(() => {
      rejectTheme?.(new Error("theme send failed"));
    });

    await waitFor(() => {
      const themeMessages = sentMessages.filter(
        (message) => message.type === "theme",
      );
      expect(themeMessages.at(-1)?.themeClass).toBe("light");
    });
  });

  it("stores renderer errors for the next renderWidget output", () => {
    const tool = {
      type: "tool-renderWidget",
      toolCallId: "widget-error",
      state: "input-available",
      input: {
        title: "Error widget",
        widgetCode: "<pochi-widget state='{}'></pochi-widget>",
        guidelinesRead: true,
      },
    } as never;
    const { container } = render(
      <RenderWidgetTool
        tool={tool}
        isExecuting={false}
        isLoading={false}
        messages={createMessagesWithTool(tool)}
      />,
    );

    act(() => {
      getWidgetIframe(container).dispatchEvent(new Event("load"));
    });
    act(() => {
      receiveHandler?.({
        type: "error",
        message: "Widget state must be JSON-serializable.",
        kind: "internal",
      });
    });

    expect(screen.queryByText("Widget failed")).toBeNull();
    expect(screen.queryByText("toolInvocation.widgetFailed")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      useRenderWidgetStore.getState().getWidgetError("widget-error"),
    ).toEqual({
      kind: "internal",
      message: "Widget state must be JSON-serializable.",
    });
    expect(statusIconMock.mock.calls.at(-1)?.[0]).toMatchObject({
      tool: {
        state: "output-available",
        output: {
          error: "Widget setup error.",
        },
      },
    });
  });

  it("stores runtime renderer errors with a user-friendly status error", () => {
    const tool = {
      type: "tool-renderWidget",
      toolCallId: "widget-runtime-error",
      state: "input-available",
      input: {
        title: "Runtime error widget",
        widgetCode: "<pochi-widget state='{}'></pochi-widget>",
        guidelinesRead: true,
      },
    } as never;
    const { container } = render(
      <RenderWidgetTool
        tool={tool}
        isExecuting={false}
        isLoading={false}
        messages={createMessagesWithTool(tool)}
      />,
    );

    act(() => {
      getWidgetIframe(container).dispatchEvent(new Event("load"));
    });
    act(() => {
      receiveHandler?.({
        type: "error",
        message: "Cannot read properties of null",
        kind: "runtime",
      });
    });

    expect(screen.queryByText("Widget failed")).toBeNull();
    expect(screen.queryByText("toolInvocation.widgetFailed")).toBeNull();
    expect(
      useRenderWidgetStore.getState().getWidgetError("widget-runtime-error"),
    ).toEqual({
      kind: "runtime",
      message: "Cannot read properties of null",
    });
    expect(statusIconMock.mock.calls.at(-1)?.[0]).toMatchObject({
      tool: {
        state: "output-available",
        output: {
          error: "Widget runtime error.",
        },
      },
    });
  });

  it("keeps setup errors when a later runtime error also fires", () => {
    const tool = {
      type: "tool-renderWidget",
      toolCallId: "widget-setup-priority-error",
      state: "input-available",
      input: {
        title: "Setup priority widget",
        widgetCode: "<div>missing pochi-widget</div><script>\\`</script>",
        guidelinesRead: true,
      },
    } as never;
    const { container } = render(
      <RenderWidgetTool
        tool={tool}
        isExecuting={false}
        isLoading={false}
        messages={createMessagesWithTool(tool)}
      />,
    );

    act(() => {
      getWidgetIframe(container).dispatchEvent(new Event("load"));
    });
    act(() => {
      receiveHandler?.({
        type: "error",
        message:
          "Widgets must include a top-level <pochi-widget> state container.",
        kind: "internal",
      });
    });
    act(() => {
      receiveHandler?.({
        type: "error",
        message: "Invalid or unexpected token",
        kind: "runtime",
      });
    });

    expect(
      useRenderWidgetStore
        .getState()
        .getWidgetError("widget-setup-priority-error"),
    ).toEqual({
      kind: "internal",
      message:
        "Widgets must include a top-level <pochi-widget> state container.",
    });
    expect(statusIconMock.mock.calls.at(-1)?.[0]).toMatchObject({
      tool: {
        state: "output-available",
        output: {
          error: "Widget setup error.",
        },
      },
    });
  });

  it("keeps the latest renderWidget interactive after the call has output", () => {
    const inputTool = {
      type: "tool-renderWidget",
      toolCallId: "widget-transition-output",
      state: "input-available",
      input: {
        title: "Transition widget",
        widgetCode: "<pochi-widget state='{}'></pochi-widget>",
        guidelinesRead: true,
      },
    } as never;
    const { container, rerender } = render(
      <RenderWidgetTool
        tool={inputTool}
        isExecuting={false}
        isLoading={false}
        messages={createMessagesWithTool(inputTool)}
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
      const outputTool = {
        type: "tool-renderWidget",
        toolCallId: "widget-transition-output",
        state: "output-available",
        input: {
          title: "Transition widget",
          widgetCode: "<pochi-widget state='{}'></pochi-widget>",
          guidelinesRead: true,
        },
        output: { state: { city: "beijing" } },
      } as never;
      rerender(
        <RenderWidgetTool
          tool={outputTool}
          isExecuting={false}
          isLoading={false}
          messages={createMessagesWithTool(outputTool)}
        />,
      );
    });

    expect(getWidgetIframe(container).className).not.toContain(
      "pointer-events-none",
    );

    act(() => {
      receiveHandler?.({ type: "state", state: { city: "shanghai" } });
    });

    expect(
      useRenderWidgetStore
        .getState()
        .getWidgetState("widget-transition-output"),
    ).toEqual({ city: "shanghai" });
  });

  it("shows failed status for committed renderWidget outputs with errors", () => {
    const tool = {
      type: "tool-renderWidget",
      toolCallId: "widget-output-error",
      state: "output-available",
      input: {
        title: "Committed widget",
        widgetCode: "<pochi-widget state='{}'></pochi-widget>",
        guidelinesRead: true,
      },
      output: {
        state: {},
        error: "Renderer failed",
      },
    } as never;

    render(
      <RenderWidgetTool
        tool={tool}
        isExecuting={false}
        isLoading={false}
        messages={[]}
      />,
    );

    expect(screen.queryByText("Widget failed")).toBeNull();
    expect(screen.queryByText("toolInvocation.widgetFailed")).toBeNull();
    expect(
      screen.queryByText(
        "This widget is from an earlier message. Only the latest widget remains interactive.",
      ),
    ).toBeNull();
  });

  it("freezes widget interaction when the renderWidget call is not in the latest assistant message", async () => {
    const tool = {
      type: "tool-renderWidget",
      toolCallId: "widget-old",
      state: "input-available",
      input: {
        title: "Old widget",
        widgetCode: "<pochi-widget state='{}'></pochi-widget>",
        guidelinesRead: true,
      },
    } as never;
    const { container } = render(
      <RenderWidgetTool
        tool={tool}
        isExecuting={false}
        isLoading={false}
        messages={[
          {
            id: "assistant-old",
            role: "assistant",
            parts: [tool],
          } as never,
          {
            id: "user-latest",
            role: "user",
            parts: [{ type: "text", text: "next" }],
          } as never,
        ]}
      />,
    );

    const frozenText =
      "This widget is from an earlier message. Only the latest widget remains interactive.";
    const frozenHint = screen.getByLabelText(frozenText);
    expect(frozenHint.textContent).not.toContain(frozenText);
    expect(frozenHint.getAttribute("title")).toBeNull();
    fireEvent.focus(frozenHint);
    await waitFor(() => {
      expect(screen.getByRole("tooltip").textContent).toContain(frozenText);
    });
    expect(getWidgetIframe(container).className).toContain(
      "pointer-events-none",
    );

    act(() => {
      getWidgetIframe(container).dispatchEvent(new Event("load"));
    });
    act(() => {
      receiveHandler?.({ type: "state", state: { city: "beijing" } });
    });

    expect(
      useRenderWidgetStore.getState().getWidgetState("widget-old"),
    ).toBeUndefined();
  });
});

function createMessagesWithTool(
  tool: Parameters<typeof RenderWidgetTool>[0]["tool"],
) {
  return [
    {
      id: "assistant-active",
      role: "assistant",
      parts: [tool],
    },
  ] as Parameters<typeof RenderWidgetTool>[0]["messages"];
}
