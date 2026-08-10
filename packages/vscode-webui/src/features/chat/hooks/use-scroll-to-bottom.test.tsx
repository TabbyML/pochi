// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollToBottom } from "./use-scroll-to-bottom";

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];

  private readonly callback: ResizeObserverCallback;

  observe = vi.fn();
  disconnect = vi.fn();

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

describe("useScrollToBottom", () => {
  beforeEach(() => {
    ResizeObserverMock.instances = [];
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not follow streaming resizes after the user scrolls away from the bottom", () => {
    const context = setup();

    context.scrollTo.mockClear();

    act(() => {
      context.userScrollTo(300);
      context.resizeObserver.trigger();
    });

    expect(context.scrollTo).not.toHaveBeenCalled();
  });

  it("continues following streaming resizes while near the bottom", () => {
    const context = setup();

    context.scrollTo.mockClear();
    context.setScrollTop(360);

    act(() => {
      context.resizeObserver.trigger();
    });

    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: "smooth",
    });
  });

  it("does not scroll on rerender after the user scrolls away from the bottom", () => {
    const context = setup();

    context.scrollTo.mockClear();

    act(() => {
      context.userScrollTo(300);
    });

    context.rerender({});

    expect(context.scrollTo).not.toHaveBeenCalled();
  });

  it("does not scroll on rerender while near the bottom", () => {
    const context = setup();

    context.scrollTo.mockClear();
    context.setScrollTop(360);

    context.rerender({});

    expect(context.scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls when the last message changes to a user message", () => {
    const context = setup();

    context.scrollTo.mockClear();

    context.rerender({
      lastUserMessageId: "user-message-1",
    });

    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: "auto",
    });
  });

  it("does not scroll for the initially observed user message id", () => {
    const context = setup({
      lastUserMessageId: "existing-user-message",
    });

    expect(context.scrollTo).toHaveBeenCalledOnce();
    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: "auto",
    });
  });

  it("scrolls when tool call approval buttons become visible", () => {
    const context = setup();

    context.scrollTo.mockClear();

    act(() => {
      context.onToolCallApprovalVisible();
    });

    expect(context.scrollTo).toHaveBeenCalledWith({
      top: 1000,
      behavior: "smooth",
    });
  });
});

function setup(
  options: {
    lastUserMessageId?: string;
  } = {},
) {
  const { container, scrollTo, setScrollTop, userScrollTo } =
    createScrollContainer();

  type HookProps = {
    lastUserMessageId?: string;
  };

  const initialProps: HookProps = {
    lastUserMessageId: options.lastUserMessageId,
  };

  const hook = renderHook(
    ({ lastUserMessageId }: HookProps) => {
      const ref = useRef<HTMLDivElement | null>(container);
      return useScrollToBottom({
        messagesContainerRef: ref,
        lastUserMessageId,
      });
    },
    {
      initialProps,
    },
  );

  expect(ResizeObserverMock.instances).toHaveLength(1);

  return {
    container,
    onToolCallApprovalVisible:
      hook.result.current?.onToolCallApprovalVisible ?? missingApprovalCallback,
    rerender: hook.rerender,
    resizeObserver: ResizeObserverMock.instances[0],
    scrollTo,
    setScrollTop,
    userScrollTo,
  };
}

function missingApprovalCallback() {
  throw new Error("onToolCallApprovalVisible is not available");
}

function createScrollContainer() {
  let scrollTop = 500;
  const scrollHeight = 1000;
  const container = document.createElement("div");
  container.appendChild(document.createElement("div"));

  Object.defineProperties(container, {
    scrollHeight: {
      configurable: true,
      get: () => scrollHeight,
    },
    clientHeight: {
      configurable: true,
      get: () => 500,
    },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    },
  });

  const scrollTo = vi.fn((scrollOptions: ScrollToOptions) => {
    if (typeof scrollOptions.top === "number") {
      scrollTop = Math.min(
        scrollOptions.top,
        scrollHeight - container.clientHeight,
      );
    }
  });
  Object.defineProperty(container, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });

  return {
    container,
    scrollTo,
    setScrollTop: (value: number) => {
      scrollTop = value;
    },
    userScrollTo: (value: number) => {
      scrollTop = value;
      container.dispatchEvent(new Event("scroll"));
    },
  };
}
